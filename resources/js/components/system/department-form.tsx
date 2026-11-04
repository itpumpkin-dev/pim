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
        title: 'DEPARTMENTS',
        href: '/system/department',
    },
];

interface DepartmentFormProps {
    department?: {
        id: number;
        name: string;
        enabled: boolean;
    };
}

interface DepartmentForm {
    name: string;
    enabled: boolean;
    [key: string]: string | boolean;
}

export default function DepartmentFormPage({ department }: DepartmentFormProps) {
    const isEdit = Boolean(department);

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<DepartmentForm>({
        name: department?.name ?? '',
        enabled: department?.enabled ?? true,
    });

    const cancel = () => router.visit('/system/department');

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        if (isEdit && department) {
            put(`/system/department/${department.id}`);
        } else {
            post('/system/department');
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
            <Head title={isEdit ? `Edit ${department?.name}` : 'Create Department'} />
            <form
                id="department-form"
                onSubmit={submit}
                style={{ padding: '2rem', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}
            >
                <Title level="H3" wrappingType="Normal" style={{ marginBottom: '1.5rem' }}>
                    {isEdit ? department?.name : 'New Department'}
                </Title>

                <FioriFormGroup style={{ maxWidth: 560 }}>
                    <FioriField label="Name" htmlFor="department-name" required valueState={valueStateOf(errors.name)} message={errors.name}>
                        <Input
                            id="department-name"
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
