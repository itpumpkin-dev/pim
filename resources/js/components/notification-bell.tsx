import echo from '@/echo';
import { xsrfToken } from '@/lib/csrf';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/accept.js';
import {
    Bar,
    Button,
    NotificationList,
    NotificationListItem,
    ResponsivePopover,
    Title,
    type NotificationListPropTypes,
} from '@ui5/webcomponents-react';
import { useCallback, useEffect, useState } from 'react';

export interface NotificationRow {
    id: string;
    title: string;
    body: string;
    status: 'success' | 'failed' | 'warning';
    url: string | null;
    read_at: string | null;
    created_at: string;
}

const STATUS_STATE: Record<NotificationRow['status'], 'Negative' | 'Critical' | 'Positive'> = {
    failed: 'Negative',
    warning: 'Critical',
    success: 'Positive',
};

/**
 * Shell-bar bell — real-time notification feed for background jobs the
 * user themselves triggered (brand/category sync, marketplace push/
 * deactivate — see AppNotifier's call sites for the full list). The bell
 * itself is the UI5 ShellBar's built-in notifications button
 * (app-sidebar-header.tsx: `showNotifications` + `notificationsCount`); this
 * hook owns the data and NotificationPopover below renders the list.
 *
 * Two data sources kept in sync deliberately:
 *  - GET /notifications on mount — the persisted list (survives a reload,
 *    shows what happened while the tab was closed).
 *  - `user.{id}` private channel's `.notification.created` push — same
 *    channel UserPermissionsChanged already uses (see routes/channels.php),
 *    just a different event name. Lets a job's result show up the instant
 *    it happens instead of only on the next page load.
 */
export function useNotifications() {
    const { auth } = usePage<SharedData>().props;
    const userId = auth?.user?.id;

    const [notifications, setNotifications] = useState<NotificationRow[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        fetch('/notifications', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((body: { data: NotificationRow[]; unread_count: number } | null) => {
                if (!body) return;
                setNotifications(body.data);
                setUnreadCount(body.unread_count);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!userId) return;

        const channelName = `user.${userId}`;
        const channel = echo.private(channelName);

        channel.listen('.notification.created', (payload: NotificationRow) => {
            setNotifications((prev) => [payload, ...prev].slice(0, 20));
            setUnreadCount((prev) => prev + 1);
        });

        return () => {
            echo.leave(channelName);
        };
    }, [userId]);

    const markOneRead = useCallback((notification: NotificationRow) => {
        if (notification.read_at) return;

        setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));

        fetch(`/notifications/${notification.id}/read`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        }).catch(() => {});
    }, []);

    const markAllRead = useCallback(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
        setUnreadCount(0);

        fetch('/notifications/mark-all-read', {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        }).catch(() => {});
    }, []);

    return { notifications, unreadCount, markOneRead, markAllRead };
}

type NotificationFeed = ReturnType<typeof useNotifications>;

interface NotificationPopoverProps {
    feed: NotificationFeed;
    open: boolean;
    opener: HTMLElement | null;
    onClose: () => void;
}

export function NotificationPopover({ feed, open, opener, onClose }: NotificationPopoverProps) {
    const { notifications, unreadCount, markOneRead, markAllRead } = feed;

    const onItemClick: NotificationListPropTypes['onItemClick'] = (e) => {
        const id = (e.detail.item as HTMLElement).dataset.id;
        const n = notifications.find((row) => row.id === id);
        if (!n) return;

        markOneRead(n);
        onClose();
        // ลิงก์ดาวน์โหลดไฟล์ (เช่น ส่งออกด่วน — QuickExportProductsJob) ไม่ใช่หน้า
        // Inertia — router.visit() จะได้ไฟล์กลับมาแทน page response ต้องให้
        // เบราว์เซอร์โหลดตรงๆ
        if (n.url) {
            if (/\/download(\?|$)/.test(n.url)) window.location.assign(n.url);
            else router.visit(n.url);
        }
    };

    return (
        <ResponsivePopover
            open={open && !!opener}
            opener={opener ?? undefined}
            onClose={onClose}
            placement="Bottom"
            horizontalAlign="End"
            accessibleName="การแจ้งเตือน"
            style={{ width: 360, maxWidth: '100vw' }}
            header={
                <Bar
                    startContent={<Title level="H5">การแจ้งเตือน</Title>}
                    endContent={
                        unreadCount > 0 ? (
                            <Button
                                design="Transparent"
                                icon="accept"
                                tooltip="อ่านทั้งหมดแล้ว"
                                accessibleName="อ่านทั้งหมดแล้ว"
                                onClick={markAllRead}
                            />
                        ) : undefined
                    }
                />
            }
        >
            <div style={{ maxHeight: 420, overflowY: 'auto', margin: '-1rem' }}>
                <NotificationList noDataText="ยังไม่มีการแจ้งเตือน" onItemClick={onItemClick}>
                    {notifications.map((n) => (
                        <NotificationListItem
                            key={n.id}
                            data-id={n.id}
                            titleText={n.title}
                            state={STATUS_STATE[n.status]}
                            read={!!n.read_at}
                            footnotes={<span>{new Date(n.created_at).toLocaleString()}</span>}
                        >
                            {n.body}
                        </NotificationListItem>
                    ))}
                </NotificationList>
            </div>
        </ResponsivePopover>
    );
}
