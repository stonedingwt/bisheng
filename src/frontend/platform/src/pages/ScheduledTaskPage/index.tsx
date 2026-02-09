import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/bs-ui/tabs";
import { useTranslation } from "react-i18next";
import TaskList from "./TaskList";
import TaskLogs from "./TaskLogs";

export default function ScheduledTaskPage() {
    const { t } = useTranslation();

    return (
        <div id="scheduled-task-scroll" className="w-full h-full px-2 pt-4">
            <Tabs defaultValue="tasks" className="w-full mb-[40px]">
                <TabsList>
                    <TabsTrigger value="tasks">{t('scheduledTask.taskList')}</TabsTrigger>
                    <TabsTrigger value="logs">{t('scheduledTask.executionLogs')}</TabsTrigger>
                </TabsList>
                <TabsContent value="tasks">
                    <TaskList />
                </TabsContent>
                <TabsContent value="logs">
                    <TaskLogs />
                </TabsContent>
            </Tabs>
        </div>
    );
}
