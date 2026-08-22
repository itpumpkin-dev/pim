import { usePermissionsWatcher } from '@/hooks/use-permissions-watcher';
import { Alert, Snackbar } from '@mui/material';
import { useTranslation } from 'react-i18next';

export function PermissionsChangedToast() {
    const { t } = useTranslation('common');
    const noticeVisible = usePermissionsWatcher();

    return (
        <Snackbar open={noticeVisible} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
            <Alert severity="warning" variant="filled" sx={{ width: '100%' }}>
                {t('permissionsChangedLoggingOut')}
            </Alert>
        </Snackbar>
    );
}
