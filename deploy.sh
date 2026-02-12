#!/bin/bash
###############################################################################
# Bisheng 一键部署脚本 (Ubuntu 22.04)
#
# 使用方式:
#   chmod +x deploy.sh
#   sudo ./deploy.sh
#
# 功能:
#   1. 安装 Docker 和 docker-compose (如果未安装)
#   2. 构建自定义后端和前端 Docker 镜像
#   3. 启动所有服务
#   4. 等待服务就绪并输出访问信息
#
# 默认访问信息:
#   URL:  http://<服务器IP>:3001
#   账号: admin
#   密码: admin
###############################################################################

set -e

# ======================= 颜色定义 =======================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${BLUE}============================================${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}============================================${NC}"; }

# ======================= 检查 root 权限 =======================
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 sudo 运行此脚本: sudo ./deploy.sh"
        exit 1
    fi
}

# ======================= 检查系统 =======================
check_system() {
    log_step "检查系统环境"

    # 检查是否为 Ubuntu
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        log_info "操作系统: $NAME $VERSION"
    else
        log_warn "无法识别操作系统，继续尝试安装..."
    fi

    # 检查架构
    ARCH=$(uname -m)
    log_info "系统架构: $ARCH"

    # 检查内存 (建议 >= 8GB)
    TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
    log_info "系统内存: ${TOTAL_MEM}MB"
    if [ "$TOTAL_MEM" -lt 4096 ]; then
        log_warn "系统内存低于 4GB，可能影响运行稳定性。建议 >= 8GB。"
    fi

    # 检查磁盘空间 (建议 >= 30GB)
    FREE_DISK=$(df -m / | awk 'NR==2{print $4}')
    log_info "可用磁盘: ${FREE_DISK}MB"
    if [ "$FREE_DISK" -lt 20480 ]; then
        log_warn "可用磁盘低于 20GB，建议 >= 30GB。"
    fi
}

# ======================= 安装 Docker =======================
install_docker() {
    log_step "安装 Docker"

    if command -v docker &>/dev/null; then
        DOCKER_VERSION=$(docker --version)
        log_info "Docker 已安装: $DOCKER_VERSION"
    else
        log_info "正在安装 Docker..."

        # 清理旧版本
        apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

        # 安装依赖
        apt-get update -y
        apt-get install -y ca-certificates curl gnupg lsb-release

        # 添加 Docker 官方 GPG key
        install -m 0755 -d /etc/apt/keyrings
        if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg
        fi

        # 添加 Docker apt 源
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
          $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

        # 安装 Docker
        apt-get update -y
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin

        # 启动 Docker
        systemctl start docker
        systemctl enable docker

        log_info "Docker 安装完成: $(docker --version)"
    fi
}

# ======================= 安装 docker-compose =======================
install_docker_compose() {
    log_step "安装 docker-compose"

    if command -v docker-compose &>/dev/null; then
        DC_VERSION=$(docker-compose --version)
        log_info "docker-compose 已安装: $DC_VERSION"
    else
        log_info "正在安装 docker-compose..."

        # 检测架构
        ARCH=$(uname -m)
        case "$ARCH" in
            x86_64)  DC_ARCH="x86_64" ;;
            aarch64) DC_ARCH="aarch64" ;;
            armv7l)  DC_ARCH="armv7" ;;
            *)       DC_ARCH="x86_64" ;;
        esac

        # 下载 docker-compose v2.24.5 (稳定版本，兼容 v1 命令格式)
        DC_URL="https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-${DC_ARCH}"
        log_info "下载地址: $DC_URL"

        curl -SL "$DC_URL" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose

        # 创建软链接确保可被找到
        ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose 2>/dev/null || true

        log_info "docker-compose 安装完成: $(docker-compose --version)"
    fi
}

# ======================= 项目目录定位 =======================
setup_project() {
    log_step "配置项目目录"

    # 获取脚本所在目录 (即项目根目录)
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    PROJECT_DIR="$SCRIPT_DIR"
    DOCKER_DIR="$PROJECT_DIR/docker"

    if [ ! -f "$DOCKER_DIR/docker-compose.yml" ]; then
        log_error "未找到 docker/docker-compose.yml，请确保在项目根目录运行此脚本"
        exit 1
    fi

    log_info "项目目录: $PROJECT_DIR"
    log_info "Docker 目录: $DOCKER_DIR"
}

# ======================= 构建镜像 =======================
build_images() {
    log_step "构建 Docker 镜像 (首次构建约需 5-15 分钟)"

    cd "$DOCKER_DIR"

    log_info "构建后端镜像..."
    docker-compose build backend 2>&1 | tail -5
    log_info "后端镜像构建完成"

    log_info "构建前端镜像..."
    docker-compose build frontend 2>&1 | tail -5
    log_info "前端镜像构建完成"
}

# ======================= 启动服务 =======================
start_services() {
    log_step "启动所有服务"

    cd "$DOCKER_DIR"

    # 先启动基础设施服务
    log_info "启动基础设施 (MySQL, Redis, Elasticsearch, Milvus)..."
    docker-compose up -d mysql redis elasticsearch etcd minio milvus

    # 等待 MySQL 容器被 Docker 标记为 healthy（首次初始化 + SQL 导入可能需要 2-3 分钟）
    log_info "等待 MySQL 就绪 (首次启动需要初始化数据库，请耐心等待)..."
    for i in $(seq 1 90); do
        MYSQL_STATUS=$(docker inspect --format='{{.State.Health.Status}}' bisheng-mysql 2>/dev/null || echo "not_found")
        if [ "$MYSQL_STATUS" = "healthy" ]; then
            log_info "MySQL 已就绪 (Docker healthy)"
            break
        fi
        if [ "$i" -eq 90 ]; then
            log_warn "MySQL 启动超时 (状态: $MYSQL_STATUS)，尝试继续..."
        fi
        if [ $((i % 10)) -eq 0 ]; then
            log_info "  MySQL 状态: $MYSQL_STATUS ... 已等待 $((i*3)) 秒"
        fi
        sleep 3
    done

    # 等待 Redis 容器被 Docker 标记为 healthy
    log_info "等待 Redis 就绪..."
    for i in $(seq 1 30); do
        REDIS_STATUS=$(docker inspect --format='{{.State.Health.Status}}' bisheng-redis 2>/dev/null || echo "not_found")
        if [ "$REDIS_STATUS" = "healthy" ]; then
            log_info "Redis 已就绪 (Docker healthy)"
            break
        fi
        sleep 2
    done

    # 启动后端（MySQL 和 Redis 此时已确认 healthy）
    log_info "启动后端服务..."
    docker-compose up -d backend backend_worker

    # 等待后端健康
    log_info "等待后端服务就绪 (可能需要 1-2 分钟)..."
    for i in $(seq 1 60); do
        if curl -sf http://localhost:7860/health >/dev/null 2>&1; then
            log_info "后端服务已就绪"
            break
        fi
        if [ "$i" -eq 60 ]; then
            log_warn "后端启动较慢，继续启动前端..."
        fi
        sleep 5
    done

    # 启动前端
    log_info "启动前端服务..."
    docker-compose up -d frontend

    sleep 5
    log_info "所有服务已启动"
}

# ======================= 检查服务状态 =======================
check_status() {
    log_step "服务状态"

    cd "$DOCKER_DIR"
    docker-compose ps

    echo ""
}

# ======================= 输出访问信息 =======================
print_info() {
    log_step "部署完成"

    # 获取服务器 IP
    SERVER_IP=$(hostname -I | awk '{print $1}')
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP="<服务器IP>"
    fi

    echo -e ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║             Bisheng 部署成功!                       ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                      ║${NC}"
    echo -e "${GREEN}║  访问地址: ${YELLOW}http://${SERVER_IP}:3001${GREEN}              ║${NC}"
    echo -e "${GREEN}║                                                      ║${NC}"
    echo -e "${GREEN}║  管理员账号: ${YELLOW}admin${GREEN}                                ║${NC}"
    echo -e "${GREEN}║  管理员密码: ${YELLOW}admin${GREEN}                                ║${NC}"
    echo -e "${GREEN}║                                                      ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  常用命令:                                           ║${NC}"
    echo -e "${GREEN}║    查看状态: cd docker && docker-compose ps          ║${NC}"
    echo -e "${GREEN}║    查看日志: cd docker && docker-compose logs -f     ║${NC}"
    echo -e "${GREEN}║    重启服务: cd docker && docker-compose restart     ║${NC}"
    echo -e "${GREEN}║    停止服务: cd docker && docker-compose down        ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ======================= 主流程 =======================
main() {
    echo -e "${BLUE}"
    echo "  ____  _     _                       "
    echo " | __ )(_)___| |__   ___ _ __   __ _  "
    echo " |  _ \\| / __| '_ \\ / _ \\ '_ \\ / _\` | "
    echo " | |_) | \\__ \\ | | |  __/ | | | (_| | "
    echo " |____/|_|___/_| |_|\\___|_| |_|\\__, | "
    echo "                                |___/  "
    echo -e "${NC}"
    echo "  Bisheng 一键部署脚本 (Ubuntu 22.04)"
    echo ""

    check_root
    check_system
    install_docker
    install_docker_compose
    setup_project
    build_images
    start_services
    check_status
    print_info
}

main "$@"
