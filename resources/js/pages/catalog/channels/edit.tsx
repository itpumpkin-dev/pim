import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type CodeEditState, codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Input, MultiComboBox, MultiComboBoxItem, Option, Select, Tab, TabContainer } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MasterFormPage, masterStyles } from '../master-crud';

interface ChannelItem {
    id: number;
    code: string;
    root_category_id: number | null;
}

interface RootCategoryOption {
    id: number;
    code: string;
    name: string;
    display_name: string;
}

interface LocaleOption {
    id: number;
    code: string;
    display_name: string | null;
}

interface CurrencyOption {
    id: number;
    code: string;
    name: string | null;
}

interface Props extends CodeEditState {
    channel: ChannelItem;
    translations: Record<string, string>;
    localeIds: number[];
    currencyIds: number[];
    rootCategories: RootCategoryOption[];
    locales: LocaleOption[];
    currencies: CurrencyOption[];
    canViewHistory?: boolean;
}

export default function ChannelEdit({
    channel,
    translations,
    localeIds,
    currencyIds,
    rootCategories,
    locales,
    currencies,
    canViewHistory = false,
    canEditCode = false,
    codeLocked = false,
}: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('channels'), href: '/catalog/channels' },
        { title: t('editChannel'), href: '#' },
    ];

    const { data, setData, put, processing, errors, transform, isDirty } = useForm({
        code: channel.code || '',
        translations: translations || ({} as Record<string, string>),
        root_category_id: (channel.root_category_id ?? 'none') as string | number,
        locale_ids: localeIds || [],
        currency_ids: currencyIds || [],
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        transform((formData) => ({
            ...formData,
            root_category_id: formData.root_category_id === 'none' ? '' : formData.root_category_id,
        }));
        skipNavigationGuardRef.current = true;
        put(`/catalog/channels/${channel.id}`, {
            onSuccess: () => router.visit('/catalog/channels', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const tabs = canViewHistory ? (
        <TabContainer collapsed style={{ marginBottom: '1.5rem' }} onTabSelect={(e) => setTabIndex(e.detail.tabIndex)}>
            <Tab text="General" selected={tabIndex === 0} />
            <Tab text="History" selected={tabIndex === 1} />
        </TabContainer>
    ) : null;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editChannel')}: ${channel.code}`} />
            {tabIndex === 1 && canViewHistory && (
                <div className={masterStyles.formPage}>
                    {tabs}
                    <HistoryPanel historyUrl={`/catalog/channels/${channel.id}/history`} />
                </div>
            )}

            {tabIndex === 0 && (
                <MasterFormPage
                    before={tabs}
                    title={t('editChannel')}
                    backHref="/catalog/channels"
                    processing={processing}
                    onSubmit={submit}
                    errors={errors}
                >
                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField
                            label={t('code')}
                            htmlFor="channel-code"
                            hint={t(codeHintKey({ canEditCode, codeLocked }))}
                            valueState={valueStateOf(errors.code)}
                            message={errors.code}
                        >
                            <Input
                                id="channel-code"
                                value={data.code}
                                disabled={!canEditCode}
                                maxlength={50}
                                valueState={ui5ValueState(valueStateOf(errors.code))}
                                onInput={(e) => setData('code', normalizeCodeInput(e.target.value))}
                            />
                        </FioriField>

                        <FioriField label={t('rootCategoryOptional')} htmlFor="root-category">
                            <Select
                                id="root-category"
                                value={String(data.root_category_id)}
                                onChange={(e) => {
                                    const value = e.detail.selectedOption.value ?? 'none';
                                    setData('root_category_id', value === 'none' ? 'none' : Number(value));
                                }}
                            >
                                <Option value="none">{t('noRootCategory')}</Option>
                                {rootCategories.map((cat) => (
                                    <Option key={cat.id} value={String(cat.id)}>
                                        {cat.display_name}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>
                    </FioriFormGroup>

                    <LocaleLabelFields
                        title={t('labelTitle')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    <FioriFormGroup title={t('currenciesAndLocalesTitle')}>
                        <FioriField
                            label={t('localesRequired')}
                            htmlFor="channel-locales"
                            required
                            valueState={valueStateOf(errors.locale_ids)}
                            message={errors.locale_ids}
                            fullWidth
                        >
                            <MultiComboBox
                                id="channel-locales"
                                style={{ width: '100%' }}
                                selectedValues={data.locale_ids.map(String)}
                                valueState={ui5ValueState(valueStateOf(errors.locale_ids))}
                                onSelectionChange={(e) =>
                                    setData(
                                        'locale_ids',
                                        e.detail.items.map((item) => Number(item.value)),
                                    )
                                }
                            >
                                {locales.map((locale) => (
                                    <MultiComboBoxItem key={locale.id} value={String(locale.id)} text={locale.display_name ?? locale.code} />
                                ))}
                            </MultiComboBox>
                        </FioriField>

                        <FioriField
                            label={t('currenciesRequired')}
                            htmlFor="channel-currencies"
                            required
                            valueState={valueStateOf(errors.currency_ids)}
                            message={errors.currency_ids}
                            fullWidth
                        >
                            <MultiComboBox
                                id="channel-currencies"
                                style={{ width: '100%' }}
                                selectedValues={data.currency_ids.map(String)}
                                valueState={ui5ValueState(valueStateOf(errors.currency_ids))}
                                onSelectionChange={(e) =>
                                    setData(
                                        'currency_ids',
                                        e.detail.items.map((item) => Number(item.value)),
                                    )
                                }
                            >
                                {currencies.map((currency) => (
                                    <MultiComboBoxItem
                                        key={currency.id}
                                        value={String(currency.id)}
                                        text={currency.code}
                                        additionalText={currency.name ?? undefined}
                                    />
                                ))}
                            </MultiComboBox>
                        </FioriField>
                    </FioriFormGroup>
                </MasterFormPage>
            )}
        </AppLayout>
    );
}
