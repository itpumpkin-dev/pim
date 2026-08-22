import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { Alert, Snackbar } from '@mui/material';
import { useEffect, useState } from 'react';

export function FlashToast() {
    const { success, error } = usePage<SharedData>().props;
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<'success' | 'error'>('success');

    // success/error are mutually exclusive per redirect (a controller flashes
    // one or the other, never both) — error is checked first only so a
    // stray leftover 'success' from an earlier visit can't mask a fresh
    // error flash if both were somehow present at once.
    useEffect(() => {
        if (error) {
            setMessage(error);
            setSeverity('error');
            setOpen(true);
        } else if (success) {
            setMessage(success);
            setSeverity('success');
            setOpen(true);
        }
    }, [success, error]);

    return (
        <Snackbar
            open={open}
            autoHideDuration={severity === 'error' ? 10000 : 6000}
            onClose={() => setOpen(false)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
            <Alert onClose={() => setOpen(false)} severity={severity} sx={{ width: '100%' }}>
                {message}
            </Alert>
        </Snackbar>
    );
}
