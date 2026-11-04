import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { MultiComboBox, MultiComboBoxItem, Option, Select } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MasterFormPage } from '../master-crud';

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

interface Props {
    rootCategories: RootCategoryOption[];
    locales: LocaleOption[];
    currencies: CurrencyOption[];
}

export default function ChannelCreate({ rootCategories, locales, currencies }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('channels'), href: '/catalog/channels' },
        { title: t('createChannel'), href: '/catalog/channels/create' },
    ];

    const { data, setData, post, processing, errors, transform, isDirty } = useForm({
        translations: {} as Record<string, string>,
        root_category_id: 'none' as string | number,
        locale_ids: [] as number[],
        currency_ids: [] as number[],
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        transform((formData) => ({
            ...formData,
            root_category_id: formData.root_category_id === 'none' ? '' : formData.root_category_id,
        }));
        skipNavigationGuardRef.current = true;
        post('/catalog/channels', {
            onSuccess: () => router.visit('/catalog/channels', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createChannel')} />
            <MasterFormPage title={t('createChannel')} backHref="/catalog/channels" processing={processing} onSubmit={submit} errors={errors}>
                <FioriFormGroup title={t('generalTitle')}>
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
        </AppLayout>
    );
}
