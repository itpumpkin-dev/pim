import { useForm } from '@inertiajs/react';
import { FormEventHandler, useRef, useState } from 'react';

import InputError from '@/components/input-error';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField, Typography } from '@mui/material';

import HeadingSmall from '@/components/heading-small';

export default function DeleteUser() {
    const passwordInput = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const { data, setData, delete: destroy, processing, reset, errors, clearErrors } = useForm({ password: '' });

    const deleteUser: FormEventHandler = (e) => {
        e.preventDefault();

        destroy(route('profile.destroy'), {
            preserveScroll: true,
            onSuccess: () => closeModal(),
            onError: () => passwordInput.current?.focus(),
            onFinish: () => reset(),
        });
    };

    const closeModal = () => {
        clearErrors();
        reset();
        setOpen(false);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <HeadingSmall title="Delete account" description="Delete your account and all of its resources" />
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'error.light',
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.12)' : 'rgba(211, 47, 47, 0.06)'),
                    p: 2,
                }}
            >
                <Box sx={{ color: 'error.main' }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Warning
                    </Typography>
                    <Typography variant="body2">Please proceed with caution, this cannot be undone.</Typography>
                </Box>

                <Button variant="contained" color="error" onClick={() => setOpen(true)} sx={{ alignSelf: 'flex-start' }}>
                    Delete account
                </Button>

                <Dialog open={open} onClose={closeModal} maxWidth="xs" fullWidth component="form" onSubmit={deleteUser}>
                    <DialogTitle>Are you sure you want to delete your account?</DialogTitle>
                    <DialogContent>
                        <DialogContentText sx={{ mb: 2 }}>
                            Once your account is deleted, all of its resources and data will also be permanently deleted. Please enter your password
                            to confirm you would like to permanently delete your account.
                        </DialogContentText>

                        <TextField
                            id="password"
                            label="Password"
                            type="password"
                            fullWidth
                            inputRef={passwordInput}
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            autoComplete="current-password"
                            error={Boolean(errors.password)}
                        />
                        <InputError message={errors.password} sx={{ mt: 1 }} />
                    </DialogContent>
                    <DialogActions>
                        <Button variant="outlined" color="inherit" onClick={closeModal}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="contained" color="error" disabled={processing}>
                            Delete account
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Box>
    );
}
