import { FLOATING_STRIP_STYLE } from '@/components/flash-toast';
import { usePermissionsWatcher } from '@/hooks/use-permissions-watcher';
import { MessageStrip } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

export function PermissionsChangedToast() {
    const { t } = useTranslation('common');
    const noticeVisible = usePermissionsWatcher();

    if (!noticeVisible) return null;

    return (
        <MessageStrip design="Critical" hideCloseButton style={FLOATING_STRIP_STYLE}>
            {t('permissionsChangedLoggingOut')}
        </MessageStrip>
    );
}
