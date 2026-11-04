import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type CodeEditState, codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, FlexBox, Input, Tab, TabContainer, Title } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AttributeGroup {
    id: number;
    code: string;
    name?: string;
}

interface Props extends CodeEditState {
    group: AttributeGroup;
    translations: Record<string, string>;
    canViewHistory?: boolean;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'ATTRIBUTE GROUPS', href: '/catalog/attributeGroups' },
    { title: 'EDIT ATTRIBUTE GROUP', href: '#' },
];

export default function AttributeGroupEdit({ group, translations, canViewHistory = false, canEditCode = false, codeLocked = false }: Props) {
    const { t } = useTranslation('catalog');
    const [tabIndex, setTabIndex] = useState(0);
    const { data, setData, put, processing, errors, isDirty } = useForm({
        code: group.code || '',
        translations: translations || {},
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/attributeGroups/${group.id}`, {
            onSuccess: () => router.visit('/catalog/attributeGroups', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Attribute Group: ${group.code}`} />
            <form
                onSubmit={submit}
                style={{ padding: 'clamp(1rem, 3vw, 2rem)', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}
            >
                {canViewHistory && (
                    <TabContainer collapsed onTabSelect={(event) => setTabIndex(event.detail.tabIndex)} style={{ marginBottom: '1.5rem' }}>
                        <Tab text="General" selected={tabIndex === 0} />
                        <Tab text="History" selected={tabIndex === 1} />
                    </TabContainer>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/attributeGroups/${group.id}/history`} />}

                {tabIndex === 0 && (
                    <>
                        {/* หัวข้อและปุ่มต่างๆ */}
                        <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                            <Title level="H3">Edit Attribute Group</Title>
                            <FlexBox style={{ gap: '0.75rem' }}>
                                <Button icon="nav-back" onClick={() => router.visit('/catalog/attributeGroups')}>
                                    Back
                                </Button>
                                <Button design="Emphasized" icon="save" disabled={processing} onClick={() => submit()}>
                                    {processing ? 'Saving…' : 'Save Attribute Group'}
                                </Button>
                            </FlexBox>
                        </FlexBox>

                        <FlexBox direction="Column" style={{ gap: '1.5rem', maxWidth: 760 }}>
                            <FioriFormGroup title="General">
                                <FioriField
                                    label="Code"
                                    htmlFor="attribute-group-code"
                                    hint={t(codeHintKey({ canEditCode, codeLocked }))}
                                    valueState={valueStateOf(errors.code)}
                                    message={errors.code}
                                >
                                    <Input
                                        id="attribute-group-code"
                                        style={{ width: '100%' }}
                                        value={data.code}
                                        disabled={!canEditCode}
                                        maxlength={45}
                                        valueState={ui5ValueState(valueStateOf(errors.code))}
                                        onInput={(e) => setData('code', normalizeCodeInput(e.target.value))}
                                    />
                                </FioriField>
                            </FioriFormGroup>

                            <LocaleLabelFields
                                values={data.translations}
                                onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                            />
                        </FlexBox>

                        <FioriFormErrorSummary
                            errors={errors}
                            message="Please correct the highlighted fields before saving."
                            style={{ marginTop: '1.5rem', maxWidth: 760 }}
                        />
                    </>
                )}
            </form>
        </AppLayout>
    );
}
