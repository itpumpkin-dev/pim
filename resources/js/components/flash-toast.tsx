import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { Alert, Snackbar } from '@mui/material';
import { useEffect, useState } from 'react';

export function FlashToast() {
    const { success } = usePage<SharedData>().props;
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (success) {
            setMessage(success);
            setOpen(true);
        }
    }, [success]);

    return (
        <Snackbar open={open} autoHideDuration={4000} onClose={() => setOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
            <Alert onClose={() => setOpen(false)} severity="success" sx={{ width: '100%' }}>
                {message}
            </Alert>
        </Snackbar>
    );
}
