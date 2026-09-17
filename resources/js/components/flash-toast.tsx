import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { Alert, Snackbar } from '@mui/material';
import { useEffect, useState } from 'react';

export function FlashToast() {
    const { success, error, warning } = usePage<SharedData>().props;
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<'success' | 'error' | 'warning'>('success');

    // success/error/warning are mutually exclusive per redirect (a controller
    // flashes exactly one, never more than one) — checked error, then
    // warning, then success, so a stray leftover from an earlier visit can't
    // mask a fresher, more important flash if more than one were somehow
    // present at once.
    useEffect(() => {
        if (error) {
            setMessage(error);
            setSeverity('error');
            setOpen(true);
        } else if (warning) {
            setMessage(warning);
            setSeverity('warning');
            setOpen(true);
        } else if (success) {
            setMessage(success);
            setSeverity('success');
            setOpen(true);
        }
    }, [success, error, warning]);

    return (
        <Snackbar
            open={open}
            autoHideDuration={severity === 'success' ? 6000 : 10000}
            onClose={() => setOpen(false)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
            <Alert onClose={() => setOpen(false)} severity={severity} sx={{ width: '100%' }}>
                {message}
            </Alert>
        </Snackbar>
    );
}
