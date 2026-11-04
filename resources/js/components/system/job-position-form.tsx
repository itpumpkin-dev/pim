import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Button, CheckBox, Input, Title } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'JOB POSITIONS',
        href: '/system/jobPosition',
    },
];

interface JobPositionFormProps {
    jobPosition?: {
        id: number;
        name: string;
        enabled: boolean;
    };
}

interface JobPositionForm {
    name: string;
    enabled: boolean;
    [key: string]: string | boolean;
}

export default function JobPositionFormPage({ jobPosition }: JobPositionFormProps) {
    const isEdit = Boolean(jobPosition);

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<JobPositionForm>({
        name: jobPosition?.name ?? '',
        enabled: jobPosition?.enabled ?? true,
    });

    const cancel = () => router.visit('/system/jobPosition');

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        if (isEdit && jobPosition) {
            put(`/system/jobPosition/${jobPosition.id}`);
        } else {
            post('/system/jobPosition');
        }
    };

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            actions={
                <>
                    <Button onClick={cancel}>CANCEL</Button>
                    <Button design="Emphasized" disabled={processing} loading={processing} loadingDelay={0} onClick={() => submit()}>
                        {processing ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <Head title={isEdit ? `Edit ${jobPosition?.name}` : 'Create Job Position'} />
            <form
                id="job-position-form"
                onSubmit={submit}
                style={{ padding: '2rem', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}
            >
                <Title level="H3" wrappingType="Normal" style={{ marginBottom: '1.5rem' }}>
                    {isEdit ? jobPosition?.name : 'New Job Position'}
                </Title>

                <FioriFormGroup style={{ maxWidth: 560 }}>
                    <FioriField label="Name" htmlFor="job-position-name" required valueState={valueStateOf(errors.name)} message={errors.name}>
                        <Input
                            id="job-position-name"
                            style={{ width: '100%' }}
                            value={data.name}
                            valueState={ui5ValueState(valueStateOf(errors.name))}
                            onInput={(e) => {
                                setData('name', e.target.value);
                                clearErrors('name');
                            }}
                        />
                    </FioriField>
                    <FioriField label="">
                        <CheckBox text="Active" checked={data.enabled} onChange={(e) => setData('enabled', e.target.checked)} />
                    </FioriField>
                </FioriFormGroup>
            </form>
        </AppLayout>
    );
}
