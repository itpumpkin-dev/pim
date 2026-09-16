import { xsrfToken } from '@/lib/csrf';
import { getFioriShell } from '@/theme';
import { type SharedData } from '@/types';
import echo from '@/echo';
import { router, usePage } from '@inertiajs/react';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import NotificationsIcon from '@mui/icons-material/Notifications';
import {
    Badge,
    Box,
    Divider,
    IconButton,
    ListItemButton,
    Menu,
    Stack,
    Tooltip,
    Typography,
    useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';

interface NotificationRow {
    id: string;
    title: string;
    body: string;
    status: 'success' | 'failed';
    url: string | null;
    read_at: string | null;
    created_at: string;
}

/**
 * Shell-bar bell — real-time notification list for background jobs the
 * user themselves triggered (brand/category sync, marketplace push/
 * deactivate — see AppNotifier's call sites for the full list). Sits next
 * to LocaleDropdown/AppearanceToggleDropdown in AppSidebarHeader.
 *
 * Two data sources kept in sync deliberately:
 *  - GET /notifications on mount — the persisted list (survives a reload,
 *    shows what happened while the tab was closed).
 *  - `user.{id}` private channel's `.notification.created` push — same
 *    channel UserPermissionsChanged already uses (see routes/channels.php),
 *    just a different event name. Lets a job's result show up the instant
 *    it happens instead of only on the next page load.
 */
export function NotificationBell() {
    const { auth } = usePage<SharedData>().props;
    const userId = auth?.user?.id;
    const theme = useTheme();
    const shell = getFioriShell(theme.palette.mode);

    const [notifications, setNotifications] = useState<NotificationRow[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    useEffect(() => {
        fetch('/notifications', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((body: { data: NotificationRow[]; unread_count: number } | null) => {
                if (!body) return;
                setNotifications(body.data);
                setUnreadCount(body.unread_count);
            });
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

    const markOneRead = (notification: NotificationRow) => {
        if (notification.read_at) return;

        setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));

        fetch(`/notifications/${notification.id}/read`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        }).catch(() => {});
    };

    const markAllRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
        setUnreadCount(0);

        fetch('/notifications/mark-all-read', {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        }).catch(() => {});
    };

    const handleOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
    const handleClose = () => setAnchorEl(null);

    const shellIconSx = {
        width: 36,
        height: 36,
        borderRadius: `${shell.borderRadius}px`,
        color: shell.textColor,
        '&:hover': { bgcolor: shell.hoverBg },
        '&:active': { bgcolor: shell.activeBg },
    } as const;

    return (
        <>
            <Tooltip title="การแจ้งเตือน">
                <IconButton onClick={handleOpen} sx={shellIconSx}>
                    <Badge badgeContent={unreadCount} color="error" max={99}>
                        <NotificationsIcon sx={{ fontSize: 20 }} />
                    </Badge>
                </IconButton>
            </Tooltip>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                slotProps={{ paper: { sx: { width: 360, maxHeight: 480 } } }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                        การแจ้งเตือน
                    </Typography>
                    {unreadCount > 0 && (
                        <Tooltip title="อ่านทั้งหมดแล้ว">
                            <IconButton size="small" onClick={markAllRead}>
                                <DoneAllIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>
                <Divider />

                {notifications.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                        ยังไม่มีการแจ้งเตือน
                    </Typography>
                ) : (
                    notifications.map((n) => (
                        <ListItemButton
                            key={n.id}
                            onClick={() => {
                                markOneRead(n);
                                handleClose();
                                if (n.url) router.visit(n.url);
                            }}
                            sx={{
                                alignItems: 'flex-start',
                                gap: 1,
                                bgcolor: n.read_at ? 'transparent' : 'action.hover',
                                whiteSpace: 'normal',
                            }}
                        >
                            <Box sx={{ mt: 0.25, color: n.status === 'failed' ? 'error.main' : 'success.main', display: 'flex' }}>
                                {n.status === 'failed' ? <ErrorOutlineIcon fontSize="small" /> : <CheckCircleOutlineIcon fontSize="small" />}
                            </Box>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography variant="body2" fontWeight={n.read_at ? 400 : 600} noWrap>
                                    {n.title}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                >
                                    {n.body}
                                </Typography>
                                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
                                    {new Date(n.created_at).toLocaleString()}
                                </Typography>
                            </Box>
                        </ListItemButton>
                    ))
                )}
            </Menu>
        </>
    );
}
