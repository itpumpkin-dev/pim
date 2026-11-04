import { type CategoryNode } from '@/components/category-cascade-select';
import { FioriFileUploader } from '@/components/fiori-file-uploader';
import { FioriField, FioriFormErrorSummary, FioriMessageStrip, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { followLink } from '@/components/import-export/follow-link';
import ImportPreflight, { type PreflightSchema } from '@/components/import-export/import-preflight';
import WizardSteps, { type WizardStep } from '@/components/import-export/wizard-steps';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/navigation-right-arrow.js';
import '@ui5/webcomponents-icons/dist/play.js';
import '@ui5/webcomponents-icons/dist/save.js';
import {
    BusyIndicator,
    Button,
    CheckBox,
    Input,
    Label,
    MultiComboBox,
    MultiComboBoxItem,
    Option,
    Panel,
    RadioButton,
    Select,
    Tag,
    Text,
    Title,
} from '@ui5/webcomponents-react';
import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

interface Props {
    types: string[];
    requiredColumnsByType: Record<string, string[]>;
    columnLabelsByType: Record<string, Record<string, string>>;
}

type SchemaResponse = PreflightSchema & { sample: { columns: string[]; rows: Record<string, string>[] } };
type ResolvedFamily = { code: string; name: string };
type FamilyOption = ResolvedFamily & { groups_count: number };
// How the family step narrows the columns — by one Product Group (its bound
// families), by Attribute Families picked directly (a file spanning many
// groups that share one family), or not at all (a file mixing groups and
// families). None of these sets the imported products' family: that always
// comes from each row's own category columns.
type ScopeMode = 'group' | 'family' | 'all';

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

/** Selectable card with a radio button — the wizard's single-choice tiles. */
function ChoiceCard({
    name,
    selected,
    title,
    description,
    onSelect,
    style,
}: {
    name: string;
    selected: boolean;
    title: ReactNode;
    description?: ReactNode;
    onSelect: () => void;
    style?: CSSProperties;
}) {
    return (
        <div className={cx(styles.choiceCard, selected && styles.choiceCardSelected)} onClick={onSelect} style={style}>
            <RadioButton
                name={name}
                checked={selected}
                accessibleName={typeof title === 'string' ? title : undefined}
                onChange={(e) => {
                    if (e.target.checked) onSelect();
                }}
            />
            <div style={{ minWidth: 0 }}>
                <span className={styles.choiceTitle}>{title}</span>
                {description && <span className={styles.choiceDescription}>{description}</span>}
            </div>
        </div>
    );
}

/** Label stacked above its control at every width — for the side-by-side category cascade. */
function StackedField({ label, htmlFor, children }: { label: ReactNode; htmlFor: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
            <Label for={htmlFor} showColon={false} wrappingType="Normal">
                {label}
            </Label>
            {children}
        </div>
    );
}

/** Step heading + subtitle. */
function StepHeading({ title, subtitle }: { title: ReactNode; subtitle: ReactNode }) {
    return (
        <div>
            <Title level="H4" size="H5" wrappingType="Normal" className={styles.sectionHeading}>
                {title}
            </Title>
            <span className={styles.secondaryText}>{subtitle}</span>
        </div>
    );
}

export default function ImportCreate({ types, requiredColumnsByType, columnLabelsByType }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { locales } = usePage<SharedData>().props;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('importsTitle'), href: '/import-export/imports' },
        { title: t('createImport'), href: '/import-export/imports/create' },
    ];

    const { data, setData, post, processing, errors, transform, isDirty, setDefaults } = useForm({
        type: types[0] ?? 'products',
        file_format: 'csv',
        field_separator: ',',
        action: 'create_update',
        validation_strategy: 'skip_errors',
        ai_translate: Boolean(false),
        source_locale: locales.find((l) => l.code === 'th')?.code ?? locales[0]?.code ?? 'th',
        family_code: '',
        allowed_errors: 10,
        image_directory_path: '',
        file: null as File | null,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const isProducts = data.type === 'products';

    // "มาสเตอร์" ในที่นี้คือทุก type ที่ไม่ใช่ products (categories/attributes/
    // attribute_families/attribute_options) — ผู้ใช้อยากให้ขั้นตอนแรกถามก่อนว่า
    // จะนำเข้า "ข้อมูลมาสเตอร์" หรือ "ข้อมูลสินค้า" แล้วค่อยให้เลือกมาสเตอร์ตัว
    // ที่ต้องการอีกที (เดิมโชว์ปนกันเป็นลิสต์เดียวหมด) ไม่ได้เปลี่ยน schema/
    // preview ใดๆ เลย แค่จัดกลุ่ม UI ของขั้นตอน "type" ใหม่เท่านั้น
    const masterTypes = types.filter((type) => type !== 'products');
    const hasProductType = types.includes('products');
    const [importKind, setImportKind] = useState<'master' | 'product'>(isProducts ? 'product' : 'master');
    const stepKeys = useMemo(() => (isProducts ? ['type', 'language', 'family', 'review', 'upload'] : ['type', 'review', 'upload']), [isProducts]);
    const steps: WizardStep[] = stepKeys.map((key) => ({
        key,
        label: t('wizardStep' + key.charAt(0).toUpperCase() + key.slice(1)),
    }));

    const [activeStep, setActiveStep] = useState(0);
    const [furthest, setFurthest] = useState(0);
    const [activeAction, setActiveAction] = useState<'save' | 'run' | null>(null);
    const [schema, setSchema] = useState<SchemaResponse | null>(null);
    const [schemaLoading, setSchemaLoading] = useState(false);

    // Category/Subcategory/Product Group cascade — replaces a flat Attribute
    // Family picker so the user says *what the data is* instead of having to
    // already know which family that maps to; the family/families that
    // narrow the review step's columns are then resolved from the chosen
    // Product Group (a leaf category) via category_attribute_family.
    const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
    const [categoryTreeLoading, setCategoryTreeLoading] = useState(false);
    const [categoryTreeError, setCategoryTreeError] = useState(false);
    // A ref, not state, gates the one-time fetch below — putting
    // categoryTreeLoading *state* in that effect's own dependency array (an
    // earlier version of this code did) made it self-retrigger: setting
    // loading=true reruns the effect, whose cleanup marks the in-flight
    // fetch's closure stale before it resolves, so its `finally` then skips
    // clearing loading — stuck at loading=true forever. A ref sidesteps that
    // because writing to it doesn't cause a re-render.
    const categoryTreeFetchStarted = useRef(false);
    const [catId, setCatId] = useState<number | null>(null);
    const [subcatId, setSubcatId] = useState<number | null>(null);
    const [groupId, setGroupId] = useState<number | null>(null);
    const [resolvedFamilies, setResolvedFamilies] = useState<ResolvedFamily[]>([]);
    const [familiesLoading, setFamiliesLoading] = useState(false);

    const [scopeMode, setScopeMode] = useState<ScopeMode>('group');
    const [familyOptions, setFamilyOptions] = useState<FamilyOption[]>([]);
    const [familyOptionsLoading, setFamilyOptionsLoading] = useState(false);
    const [familyOptionsError, setFamilyOptionsError] = useState(false);
    // Same one-time-fetch-via-ref pattern as categoryTreeFetchStarted below.
    const familyOptionsFetchStarted = useRef(false);
    const [selectedFamilies, setSelectedFamilies] = useState<FamilyOption[]>([]);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const currentKey = stepKeys[Math.min(activeStep, stepKeys.length - 1)];

    // Column schema for the review/upload steps — refetched whenever the type
    // or the chosen family changes so "required fields" and the sample always
    // match the current choices.
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        const params = new URLSearchParams();
        if (isProducts && data.family_code) params.set('family', data.family_code);
        setSchemaLoading(true);
        fetch(`/import-export/imports/schema/${data.type}?${params.toString()}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('schema fetch failed'))))
            .then((json: SchemaResponse) => {
                if (active) setSchema(json);
            })
            .catch(() => {
                if (active) setSchema(null);
            })
            .finally(() => {
                if (active) setSchemaLoading(false);
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [data.type, data.family_code, isProducts]);

    // Fetched once, lazily — only products need the category cascade.
    useEffect(() => {
        if (!isProducts || categoryTreeFetchStarted.current) return;
        categoryTreeFetchStarted.current = true;
        let active = true;
        setCategoryTreeLoading(true);
        fetch('/import-export/imports/category-tree', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`category-tree fetch failed: ${res.status}`))))
            .then((tree: CategoryNode[]) => {
                if (!active) return;
                setCategoryTree(tree);
                setCategoryTreeError(false);
            })
            .catch((err) => {
                console.error(err);
                if (active) setCategoryTreeError(true);
            })
            .finally(() => {
                if (active) setCategoryTreeLoading(false);
            });
        return () => {
            active = false;
        };
    }, [isProducts]);

    // Fetched once, lazily — only the "by Attribute Family" mode needs it.
    useEffect(() => {
        if (!isProducts || scopeMode !== 'family' || familyOptionsFetchStarted.current) return;
        familyOptionsFetchStarted.current = true;
        let active = true;
        setFamilyOptionsLoading(true);
        fetch('/import-export/imports/attribute-families', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`attribute-families fetch failed: ${res.status}`))))
            .then((list: FamilyOption[]) => {
                if (!active) return;
                setFamilyOptions(list);
                setFamilyOptionsError(false);
            })
            .catch((err) => {
                console.error(err);
                if (active) setFamilyOptionsError(true);
            })
            .finally(() => {
                if (active) setFamilyOptionsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [isProducts, scopeMode]);

    // Resolves the Attribute Family/Families bound to the chosen Product
    // Group (a leaf category) — a Product Group can bind more than one, so
    // family_code carries the comma-separated union of their codes.
    useEffect(() => {
        if (groupId === null) return;
        let active = true;
        setFamiliesLoading(true);
        fetch(`/import-export/imports/category-families/${groupId}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : []))
            .then((list: ResolvedFamily[]) => {
                if (!active) return;
                setResolvedFamilies(list);
                setData('family_code', list.map((f) => f.code).join(','));
            })
            .finally(() => {
                if (active) setFamiliesLoading(false);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupId]);

    const catNode = useMemo(() => categoryTree.find((n) => n.id === catId), [categoryTree, catId]);
    const subcatNode = useMemo(() => catNode?.children.find((n) => n.id === subcatId), [catNode, subcatId]);

    const selectCategory = (id: number | null) => {
        setCatId(id);
        setSubcatId(null);
        setGroupId(null);
        setResolvedFamilies([]);
        setData('family_code', '');
    };
    const selectSubcategory = (id: number | null) => {
        setSubcatId(id);
        setGroupId(null);
        setResolvedFamilies([]);
        setData('family_code', '');
    };
    const selectGroup = (id: number | null) => {
        setGroupId(id);
        if (id === null) {
            setResolvedFamilies([]);
            setData('family_code', '');
        }
    };
    const selectFamilies = (families: FamilyOption[]) => {
        setSelectedFamilies(families);
        setData('family_code', families.map((f) => f.code).join(','));
    };
    // Each mode starts from a clean slate — a Product Group picked under
    // "group" mode must not keep narrowing the columns after switching away.
    const resetScope = () => {
        setCatId(null);
        setSubcatId(null);
        setGroupId(null);
        setResolvedFamilies([]);
        setSelectedFamilies([]);
        setData('family_code', '');
    };
    const changeScopeMode = (mode: ScopeMode) => {
        if (mode === scopeMode) return;
        setScopeMode(mode);
        resetScope();
    };

    const goNext = () => {
        setActiveStep((step) => {
            const next = Math.min(step + 1, stepKeys.length - 1);
            setFurthest((f) => Math.max(f, next));
            return next;
        });
    };
    const goBack = () => setActiveStep((step) => Math.max(0, step - 1));
    const goToStep = (index: number) => {
        if (index <= furthest) setActiveStep(index);
    };

    const changeType = (type: string) => {
        setData('type', type);
        // Downstream choices no longer apply to the new type.
        setFurthest(0);
        setSchema(null);
        setScopeMode('group');
        resetScope();
    };

    const changeKind = (kind: 'master' | 'product') => {
        setImportKind(kind);
        if (kind === 'product') {
            if (hasProductType) changeType('products');
        } else if (!masterTypes.includes(data.type)) {
            changeType(masterTypes[0] ?? '');
        }
    };

    const sampleHref = (format: 'csv' | 'xlsx') => {
        const params = new URLSearchParams({ format });
        if (isProducts && data.family_code) params.set('family', data.family_code);
        return `/import-export/imports/sample/${data.type}?${params.toString()}`;
    };

    const requiredCodes = schema?.required ?? requiredColumnsByType[data.type] ?? [];
    const labelFor = (code: string) => schema?.labels[code] ?? columnLabelsByType[data.type]?.[code] ?? code;

    const submitForm = (run: boolean) => {
        setActiveAction(run ? 'run' : 'save');
        if (run) transform((formData) => ({ ...formData, run: true }));
        skipNavigationGuardRef.current = true;
        post('/import-export/imports', {
            onSuccess: () => {
                if (run) setDefaults();
                else router.visit('/import-export/imports', { replace: true });
            },
            onFinish: () => {
                transform((formData) => formData);
                skipNavigationGuardRef.current = false;
                setActiveAction(null);
            },
        });
    };

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (currentKey === 'upload') submitForm(false);
    };

    const isLastStep = activeStep === stepKeys.length - 1;
    // Block "Next" while the schema is still loading (if the fetch failed
    // outright, let the user proceed and rely on server-side validation when
    // the import runs) — and, on the family step, until the chosen mode has
    // what it needs: a Product Group ("group") or at least one Attribute
    // Family ("family"). "all" deliberately narrows nothing, so it never blocks.
    const scopeIncomplete = (scopeMode === 'group' && groupId === null) || (scopeMode === 'family' && selectedFamilies.length === 0);
    const nextDisabled = (currentKey === 'review' && schemaLoading) || (currentKey === 'family' && isProducts && scopeIncomplete);

    const scopeModes: { value: ScopeMode; title: string; description: string }[] = [
        { value: 'group', title: t('scopeModeGroup'), description: t('scopeModeGroupDescription') },
        { value: 'family', title: t('scopeModeFamily'), description: t('scopeModeFamilyDescription') },
        { value: 'all', title: t('wizardFamilyAll'), description: t('scopeModeAllDescription') },
    ];

    const errorFor = (field: keyof typeof errors) => errors[field];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createImport')} />
            <form onSubmit={onSubmit} className={styles.page}>
                <div className={styles.header}>
                    <Title level="H3" size="H3" wrappingType="Normal">
                        {t('createImport')}
                    </Title>
                    <Button icon="nav-back" onClick={() => router.visit('/import-export/imports')}>
                        {tCatalog('back')}
                    </Button>
                </div>

                <div className={styles.cardPadded} style={{ marginBottom: '1rem' }}>
                    <WizardSteps steps={steps} active={activeStep} furthest={furthest} onStepClick={goToStep} />
                </div>

                <div className={styles.cardPadded}>
                    {currentKey === 'type' && (
                        <div className={styles.stack} style={{ gap: '1.5rem' }}>
                            <div className={styles.stack}>
                                <StepHeading title={t('wizardTypeKindHeading')} subtitle={t('wizardTypeKindSubtitle')} />
                                <div className={styles.stack} style={{ gap: '0.75rem' }} role="radiogroup">
                                    {masterTypes.length > 0 && (
                                        <ChoiceCard
                                            name="import-kind"
                                            selected={importKind === 'master'}
                                            title={t('importKindMaster')}
                                            description={t('importKindMasterDescription')}
                                            onSelect={() => changeKind('master')}
                                        />
                                    )}
                                    {hasProductType && (
                                        <ChoiceCard
                                            name="import-kind"
                                            selected={importKind === 'product'}
                                            title={t('importKindProduct')}
                                            description={t('importKindProductDescription')}
                                            onSelect={() => changeKind('product')}
                                        />
                                    )}
                                </div>
                            </div>

                            {importKind === 'master' && masterTypes.length > 0 && (
                                <div className={styles.stack}>
                                    <StepHeading title={t('wizardMasterTypeHeading')} subtitle={t('wizardMasterTypeSubtitle')} />
                                    <div className={styles.stack} style={{ gap: '0.75rem' }} role="radiogroup">
                                        {masterTypes.map((type) => (
                                            <ChoiceCard
                                                key={type}
                                                name="import-master-type"
                                                selected={data.type === type}
                                                title={typeLabel(type)}
                                                onSelect={() => changeType(type)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {currentKey === 'language' && (
                        <div className={styles.stack}>
                            <StepHeading title={t('wizardLanguageHeading')} subtitle={t('wizardLanguageSubtitle')} />
                            <FioriField label={t('sourceLocaleLabel')} htmlFor="import-source-locale" hint={t('sourceLocaleHelp')} fullWidth>
                                <Select
                                    id="import-source-locale"
                                    className={styles.fullWidth}
                                    value={data.source_locale}
                                    onChange={(e) => setData('source_locale', e.detail.selectedOption.value ?? data.source_locale)}
                                >
                                    {locales.map((l) => (
                                        <Option key={l.code} value={l.code}>
                                            {l.display_name ?? l.code}
                                        </Option>
                                    ))}
                                </Select>
                            </FioriField>
                        </div>
                    )}

                    {currentKey === 'family' && (
                        <div className={styles.stack}>
                            <StepHeading title={t('wizardFamilyHeading')} subtitle={t('wizardFamilySubtitle')} />

                            <div className={cx(styles.responsiveRow, styles.responsiveRowMd)} style={{ gap: '0.75rem' }} role="radiogroup">
                                {scopeModes.map((mode) => (
                                    <ChoiceCard
                                        key={mode.value}
                                        name="import-scope-mode"
                                        selected={scopeMode === mode.value}
                                        title={mode.title}
                                        description={mode.description}
                                        onSelect={() => changeScopeMode(mode.value)}
                                    />
                                ))}
                            </div>

                            {scopeMode === 'family' && (
                                <div>
                                    {familyOptionsError && (
                                        <FioriMessageStrip severity="error" style={{ marginBottom: '1rem' }}>
                                            {t('familyListLoadError')}
                                        </FioriMessageStrip>
                                    )}
                                    <FioriField label={t('familyPickerLabel')} htmlFor="import-family-picker" fullWidth>
                                        <MultiComboBox
                                            id="import-family-picker"
                                            className={styles.fullWidth}
                                            loading={familyOptionsLoading}
                                            placeholder={selectedFamilies.length === 0 ? t('familyPickerPlaceholder') : undefined}
                                            selectedValues={selectedFamilies.map((f) => f.code)}
                                            onSelectionChange={(e) => {
                                                const codes = new Set(e.detail.items.map((item) => item.value));
                                                selectFamilies(familyOptions.filter((option) => codes.has(option.code)));
                                            }}
                                        >
                                            {familyOptions.map((option) => (
                                                <MultiComboBoxItem
                                                    key={option.code}
                                                    value={option.code}
                                                    text={`${option.name} (${option.code})`}
                                                    additionalText={t('familyGroupsCount', { count: option.groups_count })}
                                                />
                                            ))}
                                        </MultiComboBox>
                                    </FioriField>
                                    {selectedFamilies.length === 0 ? (
                                        <div className={styles.warningText} style={{ marginTop: '0.5rem' }}>
                                            {t('selectFamilyFirst')}
                                        </div>
                                    ) : (
                                        <span className={styles.hint}>{t('scopeModeFamilyHelp')}</span>
                                    )}
                                </div>
                            )}

                            {scopeMode === 'all' && <FioriMessageStrip severity="information">{t('scopeModeAllInfo')}</FioriMessageStrip>}

                            {scopeMode === 'group' && categoryTreeError && (
                                <FioriMessageStrip severity="error">{t('categoryTreeLoadError')}</FioriMessageStrip>
                            )}

                            {scopeMode === 'group' && (
                                <>
                                    <div className={cx(styles.responsiveRow, styles.responsiveRowSm)}>
                                        <StackedField label={t('categoryStepCategoryLabel')} htmlFor="import-category">
                                            <Select
                                                id="import-category"
                                                className={styles.fullWidth}
                                                disabled={categoryTreeLoading}
                                                value={catId === null ? '' : String(catId)}
                                                onChange={(e) => {
                                                    const v = e.detail.selectedOption.value ?? '';
                                                    selectCategory(v === '' ? null : Number(v));
                                                }}
                                            >
                                                <Option value="">—</Option>
                                                {categoryTree.map((n) => (
                                                    <Option key={n.id} value={String(n.id)}>
                                                        {n.name}
                                                    </Option>
                                                ))}
                                            </Select>
                                        </StackedField>

                                        <StackedField label={t('categoryStepSubcategoryLabel')} htmlFor="import-subcategory">
                                            <Select
                                                id="import-subcategory"
                                                className={styles.fullWidth}
                                                disabled={!catNode}
                                                value={subcatId === null ? '' : String(subcatId)}
                                                onChange={(e) => {
                                                    const v = e.detail.selectedOption.value ?? '';
                                                    selectSubcategory(v === '' ? null : Number(v));
                                                }}
                                            >
                                                <Option value="">—</Option>
                                                {(catNode?.children ?? []).map((n) => (
                                                    <Option key={n.id} value={String(n.id)}>
                                                        {n.name}
                                                    </Option>
                                                ))}
                                            </Select>
                                        </StackedField>

                                        <StackedField label={t('categoryStepProductGroupLabel')} htmlFor="import-group">
                                            <Select
                                                id="import-group"
                                                className={styles.fullWidth}
                                                disabled={!subcatNode}
                                                value={groupId === null ? '' : String(groupId)}
                                                onChange={(e) => {
                                                    const v = e.detail.selectedOption.value ?? '';
                                                    selectGroup(v === '' ? null : Number(v));
                                                }}
                                            >
                                                <Option value="">—</Option>
                                                {(subcatNode?.children ?? []).map((n) => (
                                                    <Option key={n.id} value={String(n.id)}>
                                                        {n.name}
                                                    </Option>
                                                ))}
                                            </Select>
                                        </StackedField>
                                    </div>

                                    <div>
                                        <span className={styles.subHeading} style={{ marginBottom: '0.25rem' }}>
                                            {t('resolvedFamiliesLabel')}
                                        </span>
                                        {familiesLoading ? (
                                            <div className={styles.row} style={{ gap: '0.5rem' }}>
                                                <BusyIndicator active delay={0} size="S" />
                                                <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('previewLoading')}</Text>
                                            </div>
                                        ) : groupId === null ? (
                                            <div className={styles.warningText}>{t('selectProductGroupFirst')}</div>
                                        ) : resolvedFamilies.length === 0 ? (
                                            <div className={styles.mutedItalic}>{t('noFamilyBoundToProductGroup')}</div>
                                        ) : (
                                            <div className={styles.row}>
                                                {resolvedFamilies.map((f) => (
                                                    <Tag key={f.code} design="Information" hideStateIcon>
                                                        {`${f.name} (${f.code})`}
                                                    </Tag>
                                                ))}
                                            </div>
                                        )}
                                        <span className={styles.hint}>{t('wizardFamilyHelp')}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {currentKey === 'review' && (
                        <div className={styles.stack} style={{ gap: '1.25rem' }}>
                            <StepHeading title={t('wizardReviewHeading')} subtitle={t('wizardReviewSubtitle')} />

                            {schemaLoading && !schema ? (
                                <div className={styles.row} style={{ gap: '0.5rem' }}>
                                    <BusyIndicator active delay={0} size="S" />
                                    <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('previewLoading')}</Text>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <span className={styles.subHeading}>{t('wizardRequiredAttributes')}</span>
                                        {requiredCodes.length === 0 ? (
                                            <span className={styles.secondaryText}>{t('wizardNoRequired')}</span>
                                        ) : (
                                            <div className={styles.row}>
                                                {requiredCodes.map((code) => (
                                                    <Tag key={code} design="Information" hideStateIcon>
                                                        {labelFor(code)}
                                                    </Tag>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {schema && schema.columns.length > 0 && (
                                        <div>
                                            <span className={styles.subHeading}>{t('wizardAllColumns')}</span>
                                            <div className={styles.row}>
                                                {schema.columns.map((code) => (
                                                    <Tag key={code} design={requiredCodes.includes(code) ? 'Information' : 'Neutral'} hideStateIcon>
                                                        {labelFor(code)}
                                                    </Tag>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {schema && schema.sample.columns.length > 0 && (
                                        <div>
                                            <span className={styles.subHeading}>{t('filePreview')}</span>
                                            <div className={styles.sampleTableWrap}>
                                                <table className={styles.sampleTable}>
                                                    <thead>
                                                        <tr>
                                                            {schema.sample.columns.map((col) => (
                                                                <th key={col}>{col}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            {schema.sample.columns.map((col) => (
                                                                <td key={col}>{schema.sample.rows[0]?.[col] ?? ''}</td>
                                                            ))}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    <div className={styles.actions}>
                                        <Button icon="download" onClick={() => followLink(sampleHref('csv'))}>
                                            {t('downloadSample')} · CSV
                                        </Button>
                                        <Button icon="download" onClick={() => followLink(sampleHref('xlsx'))}>
                                            {t('downloadSample')} · XLSX
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {currentKey === 'upload' && (
                        <div className={styles.stack} style={{ gap: '1.25rem' }}>
                            <StepHeading title={t('wizardUploadHeading')} subtitle={t('wizardUploadSubtitle')} />

                            <FioriFileUploader
                                files={data.file ? [data.file] : []}
                                onFilesChange={(files) => {
                                    const next = files[0] ?? null;
                                    setData('file', next);
                                    if (next) {
                                        const ext = next.name.toLowerCase().split('.').pop();
                                        setData('file_format', ext === 'xlsx' ? 'xlsx' : ext === 'xls' ? 'xls' : 'csv');
                                    }
                                }}
                                placeholder={t('chooseFile')}
                                accept=".csv,.xls,.xlsx"
                                error={errors.file}
                            />

                            <ImportPreflight file={data.file} fileFormat={data.file_format} fieldSeparator={data.field_separator} schema={schema} />

                            <Panel
                                headerText={t('wizardAdvancedOptions')}
                                collapsed={!advancedOpen}
                                onToggle={() => setAdvancedOpen((open) => !open)}
                                style={{
                                    border: '1px solid var(--sapGroup_ContentBorderColor)',
                                    borderRadius: 'var(--sapElement_BorderCornerRadius)',
                                    overflow: 'hidden',
                                }}
                            >
                                <div className={styles.stack} style={{ gap: '0.875rem', padding: '0.5rem 0' }}>
                                    <FioriField label={t('action')} htmlFor="import-action">
                                        <Select
                                            id="import-action"
                                            className={styles.fullWidth}
                                            value={data.action}
                                            onChange={(e) => setData('action', e.detail.selectedOption.value ?? data.action)}
                                        >
                                            <Option value="create_update">{t('actionCreateUpdate')}</Option>
                                            <Option value="delete">{t('actionDelete')}</Option>
                                        </Select>
                                    </FioriField>

                                    <FioriField label={t('validationStrategy')} htmlFor="import-validation">
                                        <Select
                                            id="import-validation"
                                            className={styles.fullWidth}
                                            value={data.validation_strategy}
                                            onChange={(e) =>
                                                setData('validation_strategy', e.detail.selectedOption.value ?? data.validation_strategy)
                                            }
                                        >
                                            <Option value="skip_errors">{t('validationStrategySkip')}</Option>
                                            <Option value="stop_on_errors">{t('validationStrategyStop')}</Option>
                                        </Select>
                                    </FioriField>

                                    {isProducts && (
                                        <FioriField label={t('aiTranslate')} htmlFor="import-ai-translate" hint={t('aiTranslateHelp')}>
                                            <CheckBox
                                                id="import-ai-translate"
                                                accessibleName={t('aiTranslate')}
                                                checked={data.ai_translate}
                                                onChange={(e) => setData('ai_translate', e.target.checked)}
                                            />
                                        </FioriField>
                                    )}

                                    <FioriField
                                        label={t('allowedErrors')}
                                        htmlFor="import-allowed-errors"
                                        valueState={valueStateOf(errorFor('allowed_errors'))}
                                        message={errorFor('allowed_errors')}
                                    >
                                        <Input
                                            id="import-allowed-errors"
                                            type="Number"
                                            className={styles.fullWidth}
                                            value={String(data.allowed_errors)}
                                            valueState={ui5ValueState(valueStateOf(errorFor('allowed_errors')))}
                                            onInput={(e) => setData('allowed_errors', Number(e.target.value))}
                                        />
                                    </FioriField>

                                    <FioriField label={t('fileFormat')} htmlFor="import-format">
                                        <Select
                                            id="import-format"
                                            className={styles.fullWidth}
                                            value={data.file_format}
                                            onChange={(e) => setData('file_format', e.detail.selectedOption.value ?? data.file_format)}
                                        >
                                            <Option value="csv">CSV</Option>
                                            <Option value="xls">XLS</Option>
                                            <Option value="xlsx">XLSX</Option>
                                        </Select>
                                    </FioriField>

                                    <FioriField
                                        label={t('fieldSeparator')}
                                        htmlFor="import-field-separator"
                                        valueState={valueStateOf(errorFor('field_separator'))}
                                        message={errorFor('field_separator')}
                                    >
                                        <Input
                                            id="import-field-separator"
                                            className={styles.fullWidth}
                                            value={data.field_separator}
                                            valueState={ui5ValueState(valueStateOf(errorFor('field_separator')))}
                                            onInput={(e) => setData('field_separator', e.target.value)}
                                        />
                                    </FioriField>

                                    {isProducts && (
                                        <FioriField
                                            label={t('imageDirectoryPath')}
                                            htmlFor="import-image-dir"
                                            valueState={valueStateOf(errorFor('image_directory_path'))}
                                            message={errorFor('image_directory_path')}
                                        >
                                            <Input
                                                id="import-image-dir"
                                                className={styles.fullWidth}
                                                value={data.image_directory_path}
                                                valueState={ui5ValueState(valueStateOf(errorFor('image_directory_path')))}
                                                onInput={(e) => setData('image_directory_path', e.target.value)}
                                            />
                                        </FioriField>
                                    )}
                                </div>
                            </Panel>
                        </div>
                    )}

                    <FioriFormErrorSummary errors={errors} message={tCatalog('correctHighlightedFields')} style={{ marginTop: '1rem' }} />

                    <div className={styles.footerNav}>
                        <Button icon="nav-back" onClick={goBack} disabled={activeStep === 0}>
                            {tCatalog('back')}
                        </Button>

                        {isLastStep ? (
                            <div className={styles.actions}>
                                <Button
                                    icon="save"
                                    disabled={processing || !data.file}
                                    loading={activeAction === 'save'}
                                    loadingDelay={0}
                                    onClick={() => submitForm(false)}
                                >
                                    {activeAction === 'save' ? tCatalog('saving') : tCatalog('save')}
                                </Button>
                                <Button
                                    design="Emphasized"
                                    icon="play"
                                    disabled={processing || !data.file}
                                    loading={activeAction === 'run'}
                                    loadingDelay={0}
                                    onClick={() => submitForm(true)}
                                >
                                    {t('importNow')}
                                </Button>
                            </div>
                        ) : (
                            <Button design="Emphasized" endIcon="navigation-right-arrow" onClick={goNext} disabled={nextDisabled}>
                                {t('wizardNext')}
                            </Button>
                        )}
                    </div>
                </div>
            </form>
        </AppLayout>
    );
}
