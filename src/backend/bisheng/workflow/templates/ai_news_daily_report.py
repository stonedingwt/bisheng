import urllib.request
import xml.etree.ElementTree as ET
import json
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta

def main() -> dict:
    SMTP_SERVER = "smtp.qq.com"
    SMTP_PORT = 465
    SMTP_USER = "your_email@qq.com"
    SMTP_PASSWORD = "your_smtp_auth_code"
    RECIPIENTS = [
        "recipient1@example.com",
        "recipient2@example.com",
        "recipient3@example.com",
    ]
    NEWS_SOURCES = [
        {"name": "Hacker News - AI", "url": "https://hnrss.org/newest?q=AI&count=10"},
        {"name": "Google News - AI", "url": "https://news.google.com/rss/search?q=artificial+intelligence&hl=en-US&gl=US&ceid=US:en"},
        {"name": "AI News (MIT)", "url": "https://news.mit.edu/topic/artificial-intelligence2-rss.xml"},
    ]

    all_news = []
    for source in NEWS_SOURCES:
        try:
            req = urllib.request.Request(source["url"], headers={"User-Agent": "Mozilla/5.0 (compatible; AINewsBot/1.0)"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                xml_data = resp.read().decode("utf-8", errors="ignore")
            root = ET.fromstring(xml_data)
            items = root.findall(".//item")[:5]
            for item in items:
                title = item.findtext("title", "No Title").strip()
                link = item.findtext("link", "").strip()
                desc = item.findtext("description", "").strip()
                pub_date = item.findtext("pubDate", "").strip()
                if len(desc) > 200:
                    desc = desc[:200] + "..."
                all_news.append({"source": source["name"], "title": title, "link": link, "description": desc, "pub_date": pub_date})
        except Exception as e:
            all_news.append({"source": source["name"], "title": "[Fetch Error] " + str(e)[:80], "link": "", "description": "", "pub_date": ""})

    tz = timezone(timedelta(hours=8))
    now_str = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    today = datetime.now(tz).strftime("%Y-%m-%d")
    valid_count = len([n for n in all_news if not n["title"].startswith("[")])

    news_html = ""
    current_source = ""
    for n in all_news:
        if n["source"] != current_source:
            current_source = n["source"]
            news_html += '<h2 style="color:#1a73e8;border-bottom:2px solid #1a73e8;padding-bottom:8px;margin-top:24px;">' + current_source + '</h2>\n'
        if n["link"]:
            title_html = '<a href="' + n["link"] + '" style="color:#1a73e8;text-decoration:none;">' + n["title"] + '</a>'
        else:
            title_html = n["title"]
        news_html += '<div style="margin:12px 0;padding:12px 16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #1a73e8;">'
        news_html += '<h3 style="margin:0 0 6px 0;font-size:15px;">' + title_html + '</h3>'
        news_html += '<p style="margin:0;color:#555;font-size:13px;line-height:1.5;">' + n["description"] + '</p>'
        news_html += '<span style="font-size:11px;color:#999;">' + n["pub_date"] + '</span>'
        news_html += '</div>\n'

    html_body = '<html><body style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;color:#333;">'
    html_body += '<div style="background:linear-gradient(135deg,#1a73e8,#4285f4);padding:24px;border-radius:12px;color:white;text-align:center;">'
    html_body += '<h1 style="margin:0;font-size:22px;">AI Daily News Report</h1>'
    html_body += '<p style="margin:8px 0 0;font-size:14px;opacity:0.9;">' + today + '</p></div>'
    html_body += '<p style="color:#666;font-size:13px;margin-top:16px;">Generated at ' + now_str + ' (UTC+8). Total ' + str(valid_count) + ' articles.</p>'
    html_body += news_html
    html_body += '<hr style="border:none;border-top:1px solid #eee;margin-top:30px;">'
    html_body += '<p style="text-align:center;color:#999;font-size:11px;">Auto-sent by Bisheng AI News Workflow</p>'
    html_body += '</body></html>'

    if SMTP_USER == "your_email@qq.com":
        return {"result": "[Test Mode] Got " + str(len(all_news)) + " news, email not sent (configure SMTP first)", "news_count": len(all_news)}

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "AI Daily News - " + today
        msg["From"] = SMTP_USER
        msg["To"] = ", ".join(RECIPIENTS)
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, RECIPIENTS, msg.as_string())
        return {"result": "Got " + str(len(all_news)) + " news, email sent successfully", "news_count": len(all_news)}
    except Exception as e:
        return {"result": "Got " + str(len(all_news)) + " news, email failed: " + str(e)[:100], "news_count": len(all_news)}
