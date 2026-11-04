import { useForm } from '@inertiajs/react';
import { Bar, Button, Dialog, FlexBox, Input, Label, Text, type InputDomRef } from '@ui5/webcomponents-react';
import { FormEventHandler, useRef, useState } from 'react';

import InputError from '@/components/input-error';

import HeadingSmall from '@/components/heading-small';

export default function DeleteUser() {
    const passwordInput = useRef<InputDomRef>(null);
    const formRef = useRef<HTMLFormElement>(null);
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
        <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
            <HeadingSmall title="Delete account" description="Delete your account and all of its resources" />
            <FlexBox
                direction="Column"
                style={{
                    gap: '1rem',
                    borderRadius: 'var(--sapElement_BorderCornerRadius)',
                    border: '1px solid var(--sapErrorBorderColor)',
                    background: 'var(--sapErrorBackground)',
                    padding: '1rem',
                }}
            >
                <div style={{ color: 'var(--sapNegativeTextColor)' }}>
                    <Text style={{ display: 'block', fontWeight: 500, color: 'inherit' }}>Warning</Text>
                    <Text style={{ display: 'block', color: 'inherit' }}>Please proceed with caution, this cannot be undone.</Text>
                </div>

                <Button design="Negative" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>
                    Delete account
                </Button>

                <Dialog
                    open={open}
                    onClose={closeModal}
                    headerText="Are you sure you want to delete your account?"
                    style={{ width: 'min(28rem, calc(100vw - 2rem))' }}
                    footer={
                        <Bar
                            design="Footer"
                            endContent={
                                <>
                                    <Button onClick={closeModal} disabled={processing}>
                                        Cancel
                                    </Button>
                                    <Button
                                        design="Negative"
                                        onClick={() => formRef.current?.requestSubmit()}
                                        disabled={processing}
                                        loading={processing}
                                        loadingDelay={0}
                                    >
                                        {processing ? 'Deleting…' : 'Delete account'}
                                    </Button>
                                </>
                            }
                        />
                    }
                >
                    <form ref={formRef} id="delete-user-form" onSubmit={deleteUser}>
                        <Text style={{ display: 'block', marginBottom: '1rem', color: 'var(--sapContent_LabelColor)' }}>
                            Once your account is deleted, all of its resources and data will also be permanently deleted. Please enter your password
                            to confirm you would like to permanently delete your account.
                        </Text>

                        <FlexBox direction="Column" style={{ gap: '0.25rem' }}>
                            <Label for="delete-user-password" showColon={false}>
                                Password
                            </Label>
                            <Input
                                id="delete-user-password"
                                type="Password"
                                style={{ width: '100%' }}
                                ref={passwordInput}
                                value={data.password}
                                onInput={(e) => setData('password', e.target.value)}
                                valueState={errors.password ? 'Negative' : 'None'}
                            />
                            <InputError message={errors.password} style={{ marginTop: '0.5rem' }} />
                        </FlexBox>
                    </form>
                </Dialog>
            </FlexBox>
        </FlexBox>
    );
}
