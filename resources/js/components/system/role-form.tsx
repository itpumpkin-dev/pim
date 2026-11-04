import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/information.js';
import '@ui5/webcomponents-icons/dist/navigation-down-arrow.js';
import '@ui5/webcomponents-icons/dist/navigation-up-arrow.js';
import '@ui5/webcomponents-icons/dist/search.js';
import { Button, CheckBox, FlexBox, Icon, Input, Label, Popover, Switch, Tab, TabContainer, Text, Title } from '@ui5/webcomponents-react';
import { FormEventHandler, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './role-form.module.css';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'ROLES',
        href: '/system/roles',
    },
];

interface PermissionChild {
    label: string;
}

interface PermissionAction {
    label: string;
    children?: Record<string, PermissionChild>;
}

interface PermissionResource {
    label: string;
    actions: Record<string, PermissionAction>;
}

interface PermissionModule {
    label: string;
    resources: Record<string, PermissionResource>;
}

interface RoleUserOption {
    id: number;
    employee_id: string | null;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
}

interface RoleShopOption {
    id: number;
    name: string;
    sales_platform_id: number;
    platform_name: string;
}

interface AttributeGroup {
    id: number;
    code: string;
    name: string;
    // Non-null only on a group auto-generated for a marketplace sync (e.g.
    // "lazada") — purely a display marker, not a different permission axis
    // (see attribute_groups.platform's own migration docblock).
    platform?: string | null;
}

interface Attribute {
    id: number;
    code: string;
    name: string;
}

interface RoleFormProps {
    /** Create only: prefilled into the Code field (next free role_N). */
    suggestedCode?: string;
    /** Edit only: whether the user holds roles.edit_code. */
    canEditCode?: boolean;
    catalog: Record<string, PermissionModule>;
    users: RoleUserOption[];
    shops: RoleShopOption[];
    role?: {
        id: number;
        code: string;
        label: string;
        is_active: boolean;
        is_guest?: boolean;
        permissions: Record<string, string[]>;
        user_ids: number[];
        shop_ids?: number[];
        restricted_platform_ids?: number[];
    };
    attributeGroups: AttributeGroup[];
    attributes: Attribute[];
    // แยกออกจาก attributeGroups/attributes ด้านบน — เฉพาะ group/attribute ที่มา
    // จากการ sync marketplace (ดู RoleController::attributeAccessProps()) ใช้
    // resource/action เดียวกันทุกประการ (view_attribute_groups/
    // edit_attribute_groups/view_attributes/edit_attributes) แค่แสดงคนละตาราง
    platformAttributeGroups: AttributeGroup[];
    platformAttributes: Attribute[];
}

interface RoleForm {
    code: string;
    label: string;
    is_active: boolean;
    is_guest: boolean;
    permissions: Record<string, string[]>;
    users: number[];
    shop_ids: number[];
    restricted_platforms: number[];
    [key: string]: string | boolean | number[] | Record<string, string[]>;
}

const TAB_KEYS = ['roleFormTabGeneral', 'roleFormTabPermissions', 'roleFormTabUsers', 'roleFormTabShops'];

export default function RoleFormPage({
    suggestedCode,
    canEditCode = false,
    catalog,
    users,
    shops,
    role,
    attributeGroups,
    attributes,
    platformAttributeGroups,
    platformAttributes,
}: RoleFormProps) {
    const { t } = useTranslation('system');
    const { t: tCatalog } = useTranslation('catalog');
    // Anyone may pick the code on create; renaming it later needs roles.edit_code.
    const codeEditable = !role || canEditCode;
    // Mirrors StoreRoleRequest/UpdateRoleRequest: these two roles must stay active.
    const isAdministratorRole = role?.label === 'Administrator';
    const isEdit = Boolean(role);
    const [tab, setTab] = useState(0);
    const [expandedAttrGroups, setExpandedAttrGroups] = useState(true);
    const [expandedAttributes, setExpandedAttributes] = useState(true);
    // ค้นหาแยกกันคนละกล่องสำหรับตาราง "กลุ่มแอตทริบิวต์"/"แอตทริบิวต์รายตัว" —
    // แอตทริบิวต์รายตัวมักมีเป็นร้อยรายการ (ดูคอมเมนต์ maxHeight/stickyHeader
    // ด้านล่าง) เลื่อนหาทีละบรรทัดไม่ไหว ต้องกรองด้วยชื่อได้ ส่วน "select all"
    // ของแต่ละตารางยังคงอิงจากลิสต์เต็มเสมอ (ไม่ผูกกับผลค้นหา) — ค้นหาไว้กรอง
    // แค่ว่าจะ "เห็น" แถวไหนบ้างเท่านั้น ไม่กระทบว่า "เลือกทั้งหมด" จะติ๊กอะไรบ้าง
    const [attrGroupSearch, setAttrGroupSearch] = useState('');
    const [attributeSearch, setAttributeSearch] = useState('');
    // Section แยกต่างหากสำหรับ group/attribute ที่มาจากการ sync marketplace —
    // state ชุดเดียวกันแบบขนานกับด้านบน ไม่ผูกกัน (พับ/ค้นหาอิสระจากกัน)
    const [expandedPlatformGroups, setExpandedPlatformGroups] = useState(true);
    const [expandedPlatformAttributes, setExpandedPlatformAttributes] = useState(true);
    const [platformGroupSearch, setPlatformGroupSearch] = useState('');
    const [platformAttributeSearch, setPlatformAttributeSearch] = useState('');
    // The "general" and "Platform" Attribute Access blocks used to render as
    // two full copies of the same group+attribute table layout stacked one
    // under the other. A tab switches which one is visible instead, so the
    // page doesn't carry the whole structure twice when both are present.
    const [attributeScope, setAttributeScope] = useState<'general' | 'platform'>('general');

    const allResources = useMemo(() => {
        const res: Record<string, PermissionResource> = {};
        Object.values(catalog).forEach((module) => {
            Object.entries(module.resources || {}).forEach(([key, val]) => {
                res[key] = val;
            });
        });
        return res;
    }, [catalog]);

    // Default all modules to expanded
    const initialExpandedModules = Object.keys(catalog).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(initialExpandedModules);

    // Permission tree: every resource's action list renders inline (accordion)
    // instead of a single side panel showing only one resource at a time —
    // reviewing a role used to require clicking each resource one by one to
    // see what it grants. Collapsed by default (the tree can run to dozens of
    // resources per module); "expand all" opens every currently visible one
    // at once for an audit pass. `expandedActionsByResource` is keyed by
    // `${resourceKey}:${actionKey}` rather than just `actionKey` because
    // multiple resources can now be open at the same time and action keys
    // (e.g. "view") repeat across resources.
    const [permissionSearch, setPermissionSearch] = useState('');
    const [expandedResources, setExpandedResources] = useState<Record<string, boolean>>({});
    const [expandedActionsByResource, setExpandedActionsByResource] = useState<Record<string, boolean>>({});

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<RoleForm>({
        code: role?.code ?? suggestedCode ?? '',
        label: role?.label ?? '',
        is_active: role?.is_active ?? true,
        is_guest: role?.is_guest ?? false,
        permissions: role?.permissions ?? {},
        users: role?.user_ids ?? [],
        shop_ids: role?.shop_ids ?? [],
        restricted_platforms: role?.restricted_platform_ids ?? [],
    });

    // Shops grouped by platform for the "Shops" tab. Whether a platform is
    // restricted at all is its own toggle (data.restricted_platforms), kept
    // separate from which shops are checked (data.shop_ids) — see
    // Role::restrictedPlatforms()'s docblock for why: "restricted, but zero
    // shops checked" and "not restricted" used to be the same UI state (an
    // empty checkbox list), so unchecking every shop silently fell back to
    // unrestricted instead of blocking the platform.
    const shopsByPlatform = useMemo(() => {
        const groups = new Map<number, { platformId: number; platformName: string; shops: RoleShopOption[] }>();
        shops.forEach((shop) => {
            const existing = groups.get(shop.sales_platform_id);
            if (existing) {
                existing.shops.push(shop);
            } else {
                groups.set(shop.sales_platform_id, { platformId: shop.sales_platform_id, platformName: shop.platform_name, shops: [shop] });
            }
        });
        return Array.from(groups.values());
    }, [shops]);

    const toggleShop = (shopId: number) => {
        setData('shop_ids', data.shop_ids.includes(shopId) ? data.shop_ids.filter((id) => id !== shopId) : [...data.shop_ids, shopId]);
    };

    const toggleRestrictPlatform = (platformId: number) => {
        setData(
            'restricted_platforms',
            data.restricted_platforms.includes(platformId)
                ? data.restricted_platforms.filter((id) => id !== platformId)
                : [...data.restricted_platforms, platformId],
        );
    };

    // Check if user has both products AND attributes permissions to show Attribute Access
    const hasProductsPermission = useMemo(() => {
        return (data.permissions['products'] || []).length > 0;
    }, [data.permissions]);

    // Whether any marketplace-synced ("Platform") group/attribute exists at
    // all — gates showing the scope tabs below; with nothing synced yet,
    // there's nothing to switch to, so only the general list renders.
    const hasPlatformAttributeData = platformAttributeGroups.length > 0 || platformAttributes.length > 0;

    // Read/Edit access for the "Attribute Groups" / "Individual Attributes" tables below.
    // Edit always implies Read — checking Edit turns Read on too, and unchecking Read
    // turns Edit back off, so the two resources (view_*/edit_*) never end up inconsistent.
    const hasAccess = (resource: string, prefix: 'view' | 'edit', code: string) => (data.permissions[resource] || []).includes(`${prefix}_${code}`);

    const setAccess = (viewResource: string, editResource: string, code: string, level: 'read' | 'edit', checked: boolean) => {
        const view = new Set(data.permissions[viewResource] || []);
        const edit = new Set(data.permissions[editResource] || []);

        if (level === 'read') {
            if (checked) {
                view.add(`view_${code}`);
            } else {
                view.delete(`view_${code}`);
                edit.delete(`edit_${code}`);
            }
        } else {
            if (checked) {
                edit.add(`edit_${code}`);
                view.add(`view_${code}`);
            } else {
                edit.delete(`edit_${code}`);
            }
        }

        setData('permissions', { ...data.permissions, [viewResource]: Array.from(view), [editResource]: Array.from(edit) });
    };

    const setAllAccess = (viewResource: string, editResource: string, codes: string[], level: 'read' | 'edit', checked: boolean) => {
        const view = new Set(data.permissions[viewResource] || []);
        const edit = new Set(data.permissions[editResource] || []);

        codes.forEach((code) => {
            if (level === 'read') {
                if (checked) {
                    view.add(`view_${code}`);
                } else {
                    view.delete(`view_${code}`);
                    edit.delete(`edit_${code}`);
                }
            } else {
                if (checked) {
                    edit.add(`edit_${code}`);
                    view.add(`view_${code}`);
                } else {
                    edit.delete(`edit_${code}`);
                }
            }
        });

        setData('permissions', { ...data.permissions, [viewResource]: Array.from(view), [editResource]: Array.from(edit) });
    };

    const cancel = () => router.visit('/system/roles');

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (isEdit && role) {
            put(`/system/roles/${role.id}`);
        } else {
            post('/system/roles');
        }
    };

    const allActionKeys = (resourceKey: string): string[] => {
        const resource = allResources[resourceKey];
        if (!resource) return [];
        const keys: string[] = [];
        Object.entries(resource.actions).forEach(([actionKey, action]) => {
            keys.push(actionKey);
            if (action.children) {
                Object.keys(action.children).forEach((childKey) => keys.push(`${actionKey}.${childKey}`));
            }
        });
        return keys;
    };

    const isResourceFullyGranted = (resourceKey: string): boolean => {
        const all = allActionKeys(resourceKey);
        const granted = data.permissions[resourceKey] || [];
        return all.length > 0 && all.every((key) => granted.includes(key));
    };

    const isResourcePartiallyGranted = (resourceKey: string): boolean => {
        const granted = data.permissions[resourceKey] || [];
        return granted.length > 0 && !isResourceFullyGranted(resourceKey);
    };

    const isModuleFullyGranted = (moduleKey: string): boolean => {
        const module = catalog[moduleKey];
        if (!module || !module.resources) return false;
        return Object.keys(module.resources).every((resourceKey) => isResourceFullyGranted(resourceKey));
    };

    const isModulePartiallyGranted = (moduleKey: string): boolean => {
        const module = catalog[moduleKey];
        if (!module || !module.resources) return false;

        let hasAnyGranted = false;
        let isFullyGranted = true;

        Object.keys(module.resources).forEach((resourceKey) => {
            if (data.permissions[resourceKey] && data.permissions[resourceKey].length > 0) {
                hasAnyGranted = true;
            }
            if (!isResourceFullyGranted(resourceKey)) {
                isFullyGranted = false;
            }
        });

        return hasAnyGranted && !isFullyGranted;
    };

    const toggleResourceAll = (resourceKey: string) => {
        if (isResourceFullyGranted(resourceKey)) {
            setData('permissions', { ...data.permissions, [resourceKey]: [] });
        } else {
            setData('permissions', { ...data.permissions, [resourceKey]: allActionKeys(resourceKey) });
        }
    };

    const toggleModuleAll = (moduleKey: string) => {
        const module = catalog[moduleKey];
        if (!module || !module.resources) return;

        const newPermissions = { ...data.permissions };
        const fullyGranted = isModuleFullyGranted(moduleKey);

        Object.keys(module.resources).forEach((resourceKey) => {
            newPermissions[resourceKey] = fullyGranted ? [] : allActionKeys(resourceKey);
        });

        setData('permissions', newPermissions);
    };

    const toggleAction = (resourceKey: string, actionKey: string, children?: Record<string, PermissionChild>) => {
        const current = new Set(data.permissions[resourceKey] || []);
        const willGrant = !current.has(actionKey);

        if (willGrant) {
            current.add(actionKey);
            if (children) Object.keys(children).forEach((childKey) => current.add(`${actionKey}.${childKey}`));
        } else {
            current.delete(actionKey);
            if (children) Object.keys(children).forEach((childKey) => current.delete(`${actionKey}.${childKey}`));
        }

        setData('permissions', { ...data.permissions, [resourceKey]: Array.from(current) });
    };

    const toggleChild = (resourceKey: string, actionKey: string, childKey: string, siblingKeys: string[]) => {
        const key = `${actionKey}.${childKey}`;
        const current = new Set(data.permissions[resourceKey] || []);

        if (current.has(key)) {
            current.delete(key);
            current.delete(actionKey);
        } else {
            current.add(key);
            const allSiblingsChecked = siblingKeys.every((sibling) => sibling === childKey || current.has(`${actionKey}.${sibling}`));
            if (allSiblingsChecked) current.add(actionKey);
        }

        setData('permissions', { ...data.permissions, [resourceKey]: Array.from(current) });
    };

    const isChecked = (resourceKey: string, key: string): boolean => (data.permissions[resourceKey] || []).includes(key);

    const isParentIndeterminate = (resourceKey: string, actionKey: string, children?: Record<string, PermissionChild>): boolean => {
        if (!children) return false;
        const childKeys = Object.keys(children);
        const checkedCount = childKeys.filter((childKey) => isChecked(resourceKey, `${actionKey}.${childKey}`)).length;
        return checkedCount > 0 && checkedCount < childKeys.length;
    };

    const toggleUser = (userId: number) => {
        setData('users', data.users.includes(userId) ? data.users.filter((id) => id !== userId) : [...data.users, userId]);
    };

    const moduleGrantedResourceCount = (moduleKey: string): number => {
        const module = catalog[moduleKey];
        if (!module || !module.resources) return 0;
        return Object.keys(module.resources).filter((resourceKey) => isResourceFullyGranted(resourceKey)).length;
    };

    // Filters the permission tree by module/resource label. A module stays
    // visible if its own label matches (then all of its resources show, same
    // as an unfiltered view) or at least one of its resources' labels match
    // (then only those resources show, under the still-visible module).
    const filteredModuleEntries = useMemo(() => {
        const term = permissionSearch.trim().toLowerCase();
        return Object.entries(catalog)
            .map(([moduleKey, module]) => {
                const moduleMatches = !term || module.label.toLowerCase().includes(term);
                const resourceEntries = Object.entries(module.resources || {}).filter(
                    ([, resource]) => moduleMatches || resource.label.toLowerCase().includes(term),
                );
                return [moduleKey, module, resourceEntries] as [string, PermissionModule, [string, PermissionResource][]];
            })
            .filter(([, , resourceEntries]) => resourceEntries.length > 0);
    }, [catalog, permissionSearch]);

    const visibleResourceKeys = useMemo(
        () => filteredModuleEntries.flatMap(([, , resourceEntries]) => resourceEntries.map(([resourceKey]) => resourceKey)),
        [filteredModuleEntries],
    );

    const allVisibleResourcesExpanded = visibleResourceKeys.length > 0 && visibleResourceKeys.every((key) => expandedResources[key]);

    const toggleExpandAllResources = () => {
        const next = { ...expandedResources };
        visibleResourceKeys.forEach((key) => {
            next[key] = !allVisibleResourcesExpanded;
        });
        setExpandedResources(next);
    };

    // Snapshot of the permissions this role was loaded with, captured once —
    // used only to diff against for the "N changes" summary below, never
    // written back to. A brand-new role (no `role` prop) has nothing to diff
    // against, so the summary stays hidden for it (see isEdit gate on render).
    const initialPermissionsRef = useRef<Record<string, string[]>>(role?.permissions ?? {});

    // Human-readable label for one permission tree entry (resourceKey + its
    // raw action key, e.g. "view" or "export.csv") or one attribute-access
    // entry (resourceKey is view_attribute_groups/edit_attribute_groups/
    // view_attributes/edit_attributes; the "action" is really view_<code> or
    // edit_<code> for a specific group/attribute) — both shapes end up in the
    // same flat `data.permissions` map, so the changes summary needs to
    // recognize whichever one it's looking at to show a name instead of a
    // raw key.
    const groupCodeToName = useMemo(() => {
        const map = new Map<string, string>();
        [...attributeGroups, ...platformAttributeGroups].forEach((g) => map.set(g.code, g.name));
        return map;
    }, [attributeGroups, platformAttributeGroups]);

    const attributeCodeToName = useMemo(() => {
        const map = new Map<string, string>();
        [...attributes, ...platformAttributes].forEach((a) => map.set(a.code, a.name));
        return map;
    }, [attributes, platformAttributes]);

    const attributeAccessResourceMeta: Record<string, { titleKey: string; level: 'view' | 'edit'; codeMap: Map<string, string> }> = {
        view_attribute_groups: { titleKey: 'roleFormAttributeGroupsTitle', level: 'view', codeMap: groupCodeToName },
        edit_attribute_groups: { titleKey: 'roleFormAttributeGroupsTitle', level: 'edit', codeMap: groupCodeToName },
        view_attributes: { titleKey: 'roleFormIndividualAttributesTitle', level: 'view', codeMap: attributeCodeToName },
        edit_attributes: { titleKey: 'roleFormIndividualAttributesTitle', level: 'edit', codeMap: attributeCodeToName },
    };

    const permissionEntryLabel = (resourceKey: string, actionKey: string): string => {
        const attrMeta = attributeAccessResourceMeta[resourceKey];
        if (attrMeta) {
            const prefix = `${attrMeta.level}_`;
            const code = actionKey.startsWith(prefix) ? actionKey.slice(prefix.length) : actionKey;
            const name = attrMeta.codeMap.get(code) ?? code;
            const levelLabel = attrMeta.level === 'view' ? t('roleFormReadColumn') : t('roleFormEditColumn');
            return `${t(attrMeta.titleKey)}: ${name} (${levelLabel})`;
        }

        const resource = allResources[resourceKey];
        if (!resource) return `${resourceKey}: ${actionKey}`;

        const [topKey, childKey] = actionKey.split('.');
        const action = resource.actions[topKey];
        if (!action) return `${resource.label}: ${actionKey}`;
        if (childKey && action.children?.[childKey]) {
            return `${resource.label} — ${action.label}: ${action.children[childKey].label}`;
        }
        return `${resource.label}: ${action.label}`;
    };

    // Diffs the live `data.permissions` against the snapshot taken when the
    // page loaded so the "N changes" summary (and its "view changes" list)
    // can show exactly what was added/removed without the admin having to
    // hunt through the tree and tables above for it.
    const permissionChanges = useMemo(() => {
        const before = initialPermissionsRef.current;
        const added: { resourceKey: string; actionKey: string }[] = [];
        const removed: { resourceKey: string; actionKey: string }[] = [];

        const resourceKeys = new Set([...Object.keys(before), ...Object.keys(data.permissions)]);
        resourceKeys.forEach((resourceKey) => {
            const beforeSet = new Set(before[resourceKey] || []);
            const afterSet = new Set(data.permissions[resourceKey] || []);
            afterSet.forEach((actionKey) => {
                if (!beforeSet.has(actionKey)) added.push({ resourceKey, actionKey });
            });
            beforeSet.forEach((actionKey) => {
                if (!afterSet.has(actionKey)) removed.push({ resourceKey, actionKey });
            });
        });

        return { added, removed };
    }, [data.permissions]);

    const [changesAnchorEl, setChangesAnchorEl] = useState<HTMLElement | null>(null);

    // Gates the Save button. Deliberately not Inertia's own `isDirty` —
    // that does a positional (lodash.isequal) comparison, so e.g. unchecking
    // a permission and rechecking it re-inserts it at the end of its
    // resource's array (Array.from(new Set(...)) always appends on re-add),
    // leaving the *set* of granted actions unchanged but the *array order*
    // different from the snapshot. `isDirty` would call that dirty and leave
    // Save enabled while the "N changes" summary above — which diffs the same
    // data as Sets — correctly shows nothing changed, so the two would
    // disagree. This mirrors that same order-insensitive comparison for
    // every field instead.
    const hasChanges = useMemo(() => {
        if (data.code !== (role?.code ?? suggestedCode ?? '')) return true;
        if (data.label !== (role?.label ?? '')) return true;
        if (data.is_active !== (role?.is_active ?? true)) return true;
        if (data.is_guest !== (role?.is_guest ?? false)) return true;

        const initialUserIds = new Set(role?.user_ids ?? []);
        const currentUserIds = new Set(data.users);
        if (initialUserIds.size !== currentUserIds.size) return true;
        for (const id of initialUserIds) {
            if (!currentUserIds.has(id)) return true;
        }

        const initialShopIds = new Set(role?.shop_ids ?? []);
        const currentShopIds = new Set(data.shop_ids);
        if (initialShopIds.size !== currentShopIds.size) return true;
        for (const id of initialShopIds) {
            if (!currentShopIds.has(id)) return true;
        }

        const initialRestrictedPlatformIds = new Set(role?.restricted_platform_ids ?? []);
        const currentRestrictedPlatformIds = new Set(data.restricted_platforms);
        if (initialRestrictedPlatformIds.size !== currentRestrictedPlatformIds.size) return true;
        for (const id of initialRestrictedPlatformIds) {
            if (!currentRestrictedPlatformIds.has(id)) return true;
        }

        return permissionChanges.added.length > 0 || permissionChanges.removed.length > 0;
    }, [data.code, data.label, data.is_active, data.is_guest, data.users, data.shop_ids, data.restricted_platforms, permissionChanges, role]);

    // Column pop-in priority (SAP Fiori responsive table): the "Has Role"
    // checkbox is the control being edited here, so it stays always visible
    // alongside Username (the natural identifier); the rest are descriptive
    // and reflow into the pop-in area first as space runs out.
    const userColumns: FioriResponsiveColumn<RoleUserOption>[] = [
        {
            key: 'hasRole',
            header: 'Has Role',
            priority: 'always',
            render: (user) => <CheckBox checked={data.users.includes(user.id)} onChange={() => toggleUser(user.id)} />,
        },
        {
            key: 'employeeId',
            header: 'Employee ID',
            priority: 'low',
            render: (user) => user.employee_id || '-',
        },
        {
            key: 'username',
            header: 'Username',
            priority: 'high',
            render: (user) => user.username,
        },
        {
            key: 'email',
            header: 'E-mail',
            priority: 'medium',
            render: (user) => user.email,
        },
        {
            key: 'firstName',
            header: 'First name',
            priority: 'medium',
            render: (user) => user.first_name,
        },
        {
            key: 'lastName',
            header: 'Last name',
            priority: 'low',
            render: (user) => user.last_name,
        },
    ];

    // UI5 CheckBox only renders the partial ("indeterminate") look while
    // `checked` is also true — MUI showed it regardless of `checked`. Clicking
    // a partial UI5 checkbox yields checked=true, same as MUI did.
    const selectAllState = (all: boolean, some: boolean) => ({ checked: all || some, indeterminate: some && !all });

    // Permission-matrix-style tables: only 3 columns total (the resource
    // name plus a Read and an Edit checkbox column), and Read/Edit are meant
    // to be seen and toggled together — popping either one into the detail
    // area beneath the row would split a pair the user needs side by side.
    // All three stay 'always'.
    // Factory แทนที่จะเป็น const array ตรงๆ — reuse กับทั้งตาราง "ทั่วไป" และ
    // "Platform" (checkbox หัวตาราง "เลือกทั้งหมด" ต้องอิงจาก list ของตัวเองคนละชุด)
    const makeAttributeGroupColumns = (groups: AttributeGroup[]): FioriResponsiveColumn<AttributeGroup>[] => [
        {
            key: 'name',
            header: t('roleFormAttributeGroupColumn'),
            priority: 'always',
            render: (group) => group.name,
        },
        {
            key: 'read',
            header: (
                <CheckBox
                    text={t('roleFormReadColumn')}
                    {...selectAllState(
                        groups.length > 0 && groups.every((g) => hasAccess('view_attribute_groups', 'view', g.code)),
                        groups.some((g) => hasAccess('view_attribute_groups', 'view', g.code)),
                    )}
                    onChange={(e) =>
                        setAllAccess(
                            'view_attribute_groups',
                            'edit_attribute_groups',
                            groups.map((g) => g.code),
                            'read',
                            e.target.checked,
                        )
                    }
                />
            ),
            popinText: t('roleFormReadColumn'),
            priority: 'always',
            align: 'center',
            width: 100,
            render: (group) => (
                <CheckBox
                    checked={hasAccess('view_attribute_groups', 'view', group.code)}
                    onChange={(e) => setAccess('view_attribute_groups', 'edit_attribute_groups', group.code, 'read', e.target.checked)}
                />
            ),
        },
        {
            key: 'edit',
            header: (
                <CheckBox
                    text={t('roleFormEditColumn')}
                    {...selectAllState(
                        groups.length > 0 && groups.every((g) => hasAccess('edit_attribute_groups', 'edit', g.code)),
                        groups.some((g) => hasAccess('edit_attribute_groups', 'edit', g.code)),
                    )}
                    onChange={(e) =>
                        setAllAccess(
                            'view_attribute_groups',
                            'edit_attribute_groups',
                            groups.map((g) => g.code),
                            'edit',
                            e.target.checked,
                        )
                    }
                />
            ),
            popinText: t('roleFormEditColumn'),
            priority: 'always',
            align: 'center',
            width: 100,
            render: (group) => (
                <CheckBox
                    checked={hasAccess('edit_attribute_groups', 'edit', group.code)}
                    onChange={(e) => setAccess('view_attribute_groups', 'edit_attribute_groups', group.code, 'edit', e.target.checked)}
                />
            ),
        },
    ];

    const makeAttributeColumns = (attrs: Attribute[]): FioriResponsiveColumn<Attribute>[] => [
        {
            key: 'name',
            header: t('roleFormAttributeColumn'),
            priority: 'always',
            render: (attr) => attr.name,
        },
        {
            key: 'read',
            header: (
                <CheckBox
                    text={t('roleFormReadColumn')}
                    {...selectAllState(
                        attrs.length > 0 && attrs.every((a) => hasAccess('view_attributes', 'view', a.code)),
                        attrs.some((a) => hasAccess('view_attributes', 'view', a.code)),
                    )}
                    onChange={(e) =>
                        setAllAccess(
                            'view_attributes',
                            'edit_attributes',
                            attrs.map((a) => a.code),
                            'read',
                            e.target.checked,
                        )
                    }
                />
            ),
            popinText: t('roleFormReadColumn'),
            priority: 'always',
            align: 'center',
            width: 100,
            render: (attr) => (
                <CheckBox
                    checked={hasAccess('view_attributes', 'view', attr.code)}
                    onChange={(e) => setAccess('view_attributes', 'edit_attributes', attr.code, 'read', e.target.checked)}
                />
            ),
        },
        {
            key: 'edit',
            header: (
                <FlexBox alignItems="Center" justifyContent="Center">
                    <CheckBox
                        text={t('roleFormEditColumn')}
                        {...selectAllState(
                            attrs.length > 0 && attrs.every((a) => hasAccess('edit_attributes', 'edit', a.code)),
                            attrs.some((a) => hasAccess('edit_attributes', 'edit', a.code)),
                        )}
                        onChange={(e) =>
                            setAllAccess(
                                'view_attributes',
                                'edit_attributes',
                                attrs.map((a) => a.code),
                                'edit',
                                e.target.checked,
                            )
                        }
                    />
                    <Icon
                        name="information"
                        showTooltip
                        accessibleName={t('roleFormEditOverrideTooltip')}
                        design="NonInteractive"
                        className={styles.infoIcon}
                    />
                </FlexBox>
            ),
            popinText: t('roleFormEditColumn'),
            priority: 'always',
            align: 'center',
            width: 100,
            render: (attr) => (
                <CheckBox
                    checked={hasAccess('edit_attributes', 'edit', attr.code)}
                    onChange={(e) => setAccess('view_attributes', 'edit_attributes', attr.code, 'edit', e.target.checked)}
                />
            ),
        },
    ];

    // Computed before the column factories below so "select all" in each
    // table's header can be scoped to the rows a search has actually left
    // visible (see makeAttributeGroupColumns/makeAttributeColumns) — it used
    // to always reference the full, unfiltered list, so ticking "select all"
    // while a search was active silently granted rows the admin couldn't see.
    const filteredAttributeGroups = useMemo(() => {
        const term = attrGroupSearch.trim().toLowerCase();
        if (!term) return attributeGroups;
        return attributeGroups.filter((g) => g.name.toLowerCase().includes(term));
    }, [attributeGroups, attrGroupSearch]);

    const filteredAttributes = useMemo(() => {
        const term = attributeSearch.trim().toLowerCase();
        if (!term) return attributes;
        return attributes.filter((a) => a.name.toLowerCase().includes(term));
    }, [attributes, attributeSearch]);

    const filteredPlatformAttributeGroups = useMemo(() => {
        const term = platformGroupSearch.trim().toLowerCase();
        if (!term) return platformAttributeGroups;
        return platformAttributeGroups.filter((g) => g.name.toLowerCase().includes(term));
    }, [platformAttributeGroups, platformGroupSearch]);

    const filteredPlatformAttributes = useMemo(() => {
        const term = platformAttributeSearch.trim().toLowerCase();
        if (!term) return platformAttributes;
        return platformAttributes.filter((a) => a.name.toLowerCase().includes(term));
    }, [platformAttributes, platformAttributeSearch]);

    // "select all" in the header now checks/toggles only the rows the table
    // is currently showing (the filtered list), not every row that exists.
    const attributeGroupColumns = makeAttributeGroupColumns(filteredAttributeGroups);
    const attributeColumns = makeAttributeColumns(filteredAttributes);
    const platformAttributeGroupColumns = makeAttributeGroupColumns(filteredPlatformAttributeGroups);
    const platformAttributeColumns = makeAttributeColumns(filteredPlatformAttributes);

    const changesCount = permissionChanges.added.length + permissionChanges.removed.length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={isEdit ? `Edit ${role?.label}` : 'Create Role'} />
            {/* Save/Cancel used to live in the shell bar's `actions` slot (top,
                always visible but crowded next to search/locale/avatar). Moved
                to a Fiori footer action bar instead — sticky to the bottom of
                this page's own scroll container (see AppContent's `main`,
                which is what actually scrolls) rather than the global header,
                so it stays reachable on this very long form without competing
                for shell-bar space. Same pattern as user-group-form.tsx. */}
            <form id="role-form" onSubmit={submit} className={styles.form}>
                <div className={styles.body}>
                    <Title level="H3" style={{ marginBottom: '1.5rem' }}>
                        {isEdit ? 'UPDATE' : 'CREATE'}
                    </Title>

                    {/* The changes-summary popover itself lives here (Popover renders
                        in the top layer, so its physical position in the tree doesn't
                        matter) — only its trigger button lives in the footer
                        action bar, right next to Save/Cancel. */}
                    <Popover
                        open={Boolean(changesAnchorEl)}
                        opener={changesAnchorEl ?? undefined}
                        onClose={() => setChangesAnchorEl(null)}
                        // Trigger sits in the bottom footer bar, so the popover
                        // opens upward from it — opening downward from a footer
                        // would push it off-screen.
                        placement="Top"
                        horizontalAlign="Start"
                    >
                        <div className={styles.changesPopover}>
                            {permissionChanges.added.length > 0 && (
                                <div style={{ marginBottom: permissionChanges.removed.length > 0 ? '1rem' : 0 }}>
                                    <span className={`${styles.changesHeading} ${styles.changesHeadingAdded}`}>
                                        {t('roleFormChangesAddedSection', { count: permissionChanges.added.length })}
                                    </span>
                                    {permissionChanges.added.map(({ resourceKey, actionKey }) => (
                                        <div key={`added:${resourceKey}:${actionKey}`} className={styles.changesItem}>
                                            + {permissionEntryLabel(resourceKey, actionKey)}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {permissionChanges.removed.length > 0 && (
                                <div>
                                    <span className={`${styles.changesHeading} ${styles.changesHeadingRemoved}`}>
                                        {t('roleFormChangesRemovedSection', { count: permissionChanges.removed.length })}
                                    </span>
                                    {permissionChanges.removed.map(({ resourceKey, actionKey }) => (
                                        <div key={`removed:${resourceKey}:${actionKey}`} className={styles.changesItem}>
                                            − {permissionEntryLabel(resourceKey, actionKey)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Popover>

                    <TabContainer collapsed onTabSelect={(e) => setTab(e.detail.tabIndex)} style={{ marginBottom: '1.5rem' }}>
                        {TAB_KEYS.map((key, index) => (
                            <Tab key={key} text={t(key)} selected={tab === index} />
                        ))}
                    </TabContainer>

                    {tab === 0 && (
                        <FlexBox direction="Column" style={{ maxWidth: 420, gap: '1.25rem' }}>
                            <div>
                                <FieldLabel htmlFor="role-code" required>
                                    Role Code
                                </FieldLabel>
                                <Input
                                    id="role-code"
                                    style={{ width: '100%' }}
                                    value={data.code}
                                    disabled={!codeEditable}
                                    placeholder="e.g. role_1"
                                    onInput={(e) => {
                                        setData('code', normalizeCodeInput(e.target.value));
                                        clearErrors('code');
                                    }}
                                    valueState={errors.code ? 'Negative' : 'None'}
                                    valueStateMessage={errors.code ? <div>{errors.code}</div> : undefined}
                                />
                                <HelperText error={errors.code}>{tCatalog(codeHintKey({ canEditCode: codeEditable }))}</HelperText>
                            </div>

                            <div>
                                <FieldLabel htmlFor="role-label" required>
                                    Role Name
                                </FieldLabel>
                                <Input
                                    id="role-label"
                                    style={{ width: '100%' }}
                                    value={data.label}
                                    onInput={(e) => {
                                        setData('label', e.target.value);
                                        clearErrors('label');
                                    }}
                                    valueState={errors.label ? 'Negative' : 'None'}
                                    valueStateMessage={errors.label ? <div>{errors.label}</div> : undefined}
                                />
                                <HelperText error={errors.label} />
                            </div>

                            <div>
                                <FieldLabel htmlFor="role-status">Status</FieldLabel>
                                <FlexBox alignItems="Center" style={{ gap: '0.5rem' }}>
                                    <Switch
                                        id="role-status"
                                        checked={data.is_active}
                                        disabled={isAdministratorRole || data.is_guest}
                                        onChange={(e) => {
                                            setData('is_active', e.target.checked);
                                            clearErrors('is_active');
                                        }}
                                    />
                                    <Text>{data.is_active ? 'Active' : 'Inactive'}</Text>
                                </FlexBox>
                                <HelperText error={errors.is_active}>
                                    {isAdministratorRole
                                        ? 'The Administrator role is always active.'
                                        : data.is_guest
                                          ? 'The guest role must stay active.'
                                          : 'An inactive role grants none of its permissions to its users and groups.'}
                                </HelperText>
                            </div>

                            <div className={styles.guestBlock}>
                                <CheckBox
                                    text="Guest role (applies to visitors who aren't logged in)"
                                    wrappingType="Normal"
                                    checked={data.is_guest}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        // The guest role must be active (see the Status hint above).
                                        setData((prev) => ({ ...prev, is_guest: checked, is_active: checked ? true : prev.is_active }));
                                    }}
                                />
                                <span className={styles.helper} style={{ paddingLeft: '2.75rem' }}>
                                    This role's Attribute Access restrictions (Permissions tab) govern what anonymous visitors see on the public
                                    product pages. Only one role can be marked as the guest role — checking this here will uncheck it on whichever
                                    role currently has it.
                                </span>
                            </div>
                        </FlexBox>
                    )}

                    {tab === 1 && (
                        <>
                            <span className={styles.helper} style={{ marginBottom: '1rem', maxWidth: 720 }}>
                                {t('roleFormPermissionsHint')}
                            </span>

                            <FlexBox alignItems="Center" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                                <SearchInput value={permissionSearch} onChange={setPermissionSearch} placeholder={t('searchByName')} />
                                <Button design="Transparent" onClick={toggleExpandAllResources} disabled={visibleResourceKeys.length === 0}>
                                    {allVisibleResourcesExpanded ? t('roleFormCollapseAll') : t('roleFormExpandAll')}
                                </Button>
                            </FlexBox>

                            <FlexBox direction="Column" style={{ gap: '0.5rem' }}>
                                {filteredModuleEntries.length === 0 && <Text className={styles.secondaryText}>{t('noResultsFound')}</Text>}
                                {filteredModuleEntries.map(([moduleKey, module, resourceEntries]) => {
                                    // While a search is active, force every matching module
                                    // open regardless of its remembered collapse state —
                                    // otherwise a module the admin had manually collapsed
                                    // still shows collapsed even though one of its resources
                                    // matched the search, so the match exists in
                                    // filteredModuleEntries but never actually renders.
                                    const isExpanded = permissionSearch.trim() ? true : (expandedModules[moduleKey] ?? true);
                                    const grantedCount = moduleGrantedResourceCount(moduleKey);
                                    const totalCount = Object.keys(module.resources || {}).length;
                                    const toggleModuleExpanded = () => setExpandedModules({ ...expandedModules, [moduleKey]: !isExpanded });
                                    const moduleFull = isModuleFullyGranted(moduleKey);
                                    const modulePartial = isModulePartiallyGranted(moduleKey);
                                    return (
                                        <div key={moduleKey} style={{ marginBottom: '0.5rem' }}>
                                            <FlexBox alignItems="Center" style={{ marginBottom: '0.5rem' }}>
                                                <ExpandToggle expanded={isExpanded} onClick={toggleModuleExpanded} />
                                                <CheckBox
                                                    checked={moduleFull || modulePartial}
                                                    indeterminate={modulePartial && !moduleFull}
                                                    onChange={() => toggleModuleAll(moduleKey)}
                                                    accessibleName={module.label}
                                                />
                                                <span className={styles.moduleLabel} onClick={toggleModuleExpanded}>
                                                    {module.label}
                                                </span>
                                                <span
                                                    className={styles.secondaryText}
                                                    style={{ marginLeft: '0.5rem', fontSize: 'var(--sapFontSmallSize)' }}
                                                >
                                                    ({grantedCount}/{totalCount})
                                                </span>
                                            </FlexBox>
                                            {isExpanded && (
                                                <FlexBox direction="Column" style={{ paddingLeft: '2rem' }}>
                                                    {resourceEntries.map(([resourceKey, resource]) => {
                                                        const resourceExpanded = expandedResources[resourceKey] ?? false;
                                                        const toggleResourceExpanded = () =>
                                                            setExpandedResources({ ...expandedResources, [resourceKey]: !resourceExpanded });
                                                        const resourceFull = isResourceFullyGranted(resourceKey);
                                                        const resourcePartial = isResourcePartiallyGranted(resourceKey);
                                                        return (
                                                            <div key={resourceKey}>
                                                                <FlexBox alignItems="Center" style={{ gap: '0.25rem', padding: '0 0.25rem' }}>
                                                                    <ExpandToggle expanded={resourceExpanded} onClick={toggleResourceExpanded} />
                                                                    <CheckBox
                                                                        checked={resourceFull || resourcePartial}
                                                                        indeterminate={resourcePartial && !resourceFull}
                                                                        onChange={() => toggleResourceAll(resourceKey)}
                                                                        accessibleName={resource.label}
                                                                    />
                                                                    <span className={styles.resourceLabel} onClick={toggleResourceExpanded}>
                                                                        {resource.label}
                                                                    </span>
                                                                </FlexBox>
                                                                {resourceExpanded && (
                                                                    <div className={styles.treeBranch} style={{ paddingLeft: '3rem' }}>
                                                                        {Object.entries(resource.actions).map(([actionKey, action]) => {
                                                                            const hasChildren = Boolean(action.children);
                                                                            const actionExpandKey = `${resourceKey}:${actionKey}`;
                                                                            const actionExpanded = expandedActionsByResource[actionExpandKey] ?? true;
                                                                            const actionChecked = isChecked(resourceKey, actionKey);
                                                                            const actionPartial = isParentIndeterminate(
                                                                                resourceKey,
                                                                                actionKey,
                                                                                action.children,
                                                                            );

                                                                            return (
                                                                                <div key={actionKey}>
                                                                                    <FlexBox alignItems="Center">
                                                                                        <CheckBox
                                                                                            text={action.label}
                                                                                            checked={actionChecked || actionPartial}
                                                                                            indeterminate={actionPartial}
                                                                                            onChange={() =>
                                                                                                toggleAction(resourceKey, actionKey, action.children)
                                                                                            }
                                                                                        />
                                                                                        {hasChildren && (
                                                                                            <ExpandToggle
                                                                                                expanded={actionExpanded}
                                                                                                onClick={() =>
                                                                                                    setExpandedActionsByResource({
                                                                                                        ...expandedActionsByResource,
                                                                                                        [actionExpandKey]: !actionExpanded,
                                                                                                    })
                                                                                                }
                                                                                            />
                                                                                        )}
                                                                                    </FlexBox>
                                                                                    {hasChildren && actionExpanded && (
                                                                                        <FlexBox
                                                                                            direction="Column"
                                                                                            alignItems="Start"
                                                                                            className={styles.treeBranch}
                                                                                            style={{ paddingLeft: '2rem' }}
                                                                                        >
                                                                                            {Object.entries(action.children!).map(
                                                                                                ([childKey, child]) => (
                                                                                                    <CheckBox
                                                                                                        key={childKey}
                                                                                                        text={child.label}
                                                                                                        checked={isChecked(
                                                                                                            resourceKey,
                                                                                                            `${actionKey}.${childKey}`,
                                                                                                        )}
                                                                                                        onChange={() =>
                                                                                                            toggleChild(
                                                                                                                resourceKey,
                                                                                                                actionKey,
                                                                                                                childKey,
                                                                                                                Object.keys(action.children!),
                                                                                                            )
                                                                                                        }
                                                                                                    />
                                                                                                ),
                                                                                            )}
                                                                                        </FlexBox>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </FlexBox>
                                            )}
                                        </div>
                                    );
                                })}
                            </FlexBox>

                            {/* Attribute Access Section - Only show if user has products permission */}
                            {hasProductsPermission ? (
                                // "General" and Platform-sourced (marketplace-synced) groups/
                                // attributes used to render as two full copies of this same
                                // group+attribute table layout stacked one under the other.
                                // A tab switches which scope is visible instead — same
                                // resource/action pair underneath either way
                                // (view_attribute_groups/edit_attribute_groups/
                                // view_attributes/edit_attributes), just a different list
                                // of rows. The tab itself only shows up once there's a
                                // Platform scope to switch to (see hasPlatformAttributeData).
                                <div className={styles.attributeAccess}>
                                    <Title level="H5" className={styles.attributeAccessTitle}>
                                        📋 {t('roleFormAttributeAccessTitle')}
                                    </Title>

                                    {hasPlatformAttributeData && (
                                        <TabContainer
                                            collapsed
                                            onTabSelect={(e) => setAttributeScope(e.detail.tabIndex === 1 ? 'platform' : 'general')}
                                            style={{ marginBottom: '0.5rem' }}
                                        >
                                            <Tab text={t('roleFormAttributeScopeGeneral')} selected={attributeScope === 'general'} />
                                            <Tab text={t('roleFormAttributeScopePlatform')} selected={attributeScope === 'platform'} />
                                        </TabContainer>
                                    )}

                                    <span className={styles.helper} style={{ marginBottom: '1rem' }}>
                                        {attributeScope === 'platform'
                                            ? t('roleFormPlatformAttributeAccessDescription')
                                            : t('roleFormAttributeAccessDescription')}
                                    </span>

                                    {attributeScope === 'platform' ? (
                                        <>
                                            {/* Platform Attribute Groups */}
                                            <div style={{ marginBottom: '1.5rem' }}>
                                                <SectionHeader
                                                    expanded={expandedPlatformGroups}
                                                    onToggle={() => setExpandedPlatformGroups(!expandedPlatformGroups)}
                                                >
                                                    🏷️ {t('roleFormPlatformAttributeGroupsTitle')}
                                                </SectionHeader>

                                                {expandedPlatformGroups && (
                                                    <>
                                                        <SearchInput
                                                            value={platformGroupSearch}
                                                            onChange={setPlatformGroupSearch}
                                                            placeholder={t('searchByName')}
                                                            style={{ marginBottom: '0.75rem' }}
                                                        />
                                                        <FioriResponsiveTable
                                                            columns={platformAttributeGroupColumns}
                                                            rows={filteredPlatformAttributeGroups}
                                                            getRowKey={(group) => group.id}
                                                            emptyMessage={t('noResultsFound')}
                                                        />
                                                    </>
                                                )}
                                            </div>

                                            {/* Platform Attributes */}
                                            <div>
                                                <SectionHeader
                                                    expanded={expandedPlatformAttributes}
                                                    onToggle={() => setExpandedPlatformAttributes(!expandedPlatformAttributes)}
                                                >
                                                    ⚙️ {t('roleFormPlatformAttributesTitle')}
                                                </SectionHeader>

                                                {expandedPlatformAttributes && (
                                                    <>
                                                        <SearchInput
                                                            value={platformAttributeSearch}
                                                            onChange={setPlatformAttributeSearch}
                                                            placeholder={t('searchByName')}
                                                            style={{ marginBottom: '0.75rem' }}
                                                        />
                                                        <FioriResponsiveTable
                                                            stickyHeader
                                                            maxHeight={500}
                                                            columns={platformAttributeColumns}
                                                            rows={filteredPlatformAttributes}
                                                            getRowKey={(attr) => attr.id}
                                                            emptyMessage={t('noResultsFound')}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {/* Attribute Groups */}
                                            <div style={{ marginBottom: '1.5rem' }}>
                                                <SectionHeader
                                                    expanded={expandedAttrGroups}
                                                    onToggle={() => setExpandedAttrGroups(!expandedAttrGroups)}
                                                >
                                                    🏷️ {t('roleFormAttributeGroupsTitle')}
                                                </SectionHeader>

                                                {expandedAttrGroups && (
                                                    <>
                                                        <SearchInput
                                                            value={attrGroupSearch}
                                                            onChange={setAttrGroupSearch}
                                                            placeholder={t('searchByName')}
                                                            style={{ marginBottom: '0.75rem' }}
                                                        />
                                                        <FioriResponsiveTable
                                                            columns={attributeGroupColumns}
                                                            rows={filteredAttributeGroups}
                                                            getRowKey={(group) => group.id}
                                                            emptyMessage={t('noResultsFound')}
                                                        />
                                                    </>
                                                )}
                                            </div>

                                            {/* Attributes */}
                                            <div>
                                                <SectionHeader
                                                    expanded={expandedAttributes}
                                                    onToggle={() => setExpandedAttributes(!expandedAttributes)}
                                                >
                                                    ⚙️ {t('roleFormIndividualAttributesTitle')}
                                                </SectionHeader>

                                                {expandedAttributes && (
                                                    <>
                                                        <SearchInput
                                                            value={attributeSearch}
                                                            onChange={setAttributeSearch}
                                                            placeholder={t('searchByName')}
                                                            style={{ marginBottom: '0.75rem' }}
                                                        />
                                                        {/* maxHeight ต้องอยู่บน FioriResponsiveTable เอง (ไม่ใช่ div ที่ห่อ
                                                        ข้างนอก) — ไม่งั้น sticky header จะเกาะกับ container ข้างนอกไม่ได้จริงๆ
                                                        (เลื่อนพ้นไปแล้วหัวตารางก็หายไปด้วย) ดู FioriResponsiveTable ทีคอมเมนต์ */}
                                                        <FioriResponsiveTable
                                                            stickyHeader
                                                            maxHeight={500}
                                                            columns={attributeColumns}
                                                            rows={filteredAttributes}
                                                            getRowKey={(attr) => attr.id}
                                                            emptyMessage={t('noResultsFound')}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className={styles.warningBox}>
                                    <Text className={styles.warningText}>⚠️ {t('roleFormProductsPermissionRequired')}</Text>
                                </div>
                            )}
                        </>
                    )}

                    {tab === 2 && (
                        <FioriResponsiveTable
                            columns={userColumns}
                            rows={users}
                            getRowKey={(user) => user.id}
                            rowClassName={(user: RoleUserOption) => (data.users.includes(user.id) ? styles.selectedRow : undefined)}
                            emptyMessage="No users found."
                        />
                    )}

                    {tab === 3 && (
                        <div style={{ maxWidth: 640 }}>
                            <span className={styles.helper} style={{ marginBottom: '1.5rem' }}>
                                {t('roleFormShopsHint')}
                            </span>

                            {shopsByPlatform.length === 0 && <Text className={styles.secondaryText}>{t('roleFormShopsNoShops')}</Text>}

                            {shopsByPlatform.map(({ platformId, platformName, shops: platformShops }) => {
                                const isRestricted = data.restricted_platforms.includes(platformId);
                                const checkedCount = platformShops.filter((shop) => data.shop_ids.includes(shop.id)).length;

                                return (
                                    <div key={platformId} className={styles.platformBlock}>
                                        <Title level="H6" style={{ marginBottom: '0.5rem' }}>
                                            {platformName}
                                        </Title>

                                        <CheckBox
                                            text={t('roleFormShopsRestrictToggle')}
                                            wrappingType="Normal"
                                            checked={isRestricted}
                                            onChange={() => toggleRestrictPlatform(platformId)}
                                        />

                                        {isRestricted ? (
                                            <>
                                                {checkedCount === 0 && (
                                                    <span className={`${styles.helper} ${styles.warningText}`} style={{ paddingLeft: '2rem' }}>
                                                        {t('roleFormShopsZeroSelectedWarning')}
                                                    </span>
                                                )}
                                                <FlexBox direction="Column" alignItems="Start" style={{ paddingLeft: '2rem' }}>
                                                    {platformShops.map((shop) => (
                                                        <CheckBox
                                                            key={shop.id}
                                                            text={shop.name}
                                                            checked={data.shop_ids.includes(shop.id)}
                                                            onChange={() => toggleShop(shop.id)}
                                                        />
                                                    ))}
                                                </FlexBox>
                                            </>
                                        ) : (
                                            <span className={styles.helper} style={{ paddingLeft: '2rem' }}>
                                                {t('roleFormShopsUnrestrictedNote')}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Fiori footer action bar — ปุ่มอยู่ล่างสุด ติดขอบ ไม่ใช่บน header */}
                <div className={styles.footer}>
                    {/* Diffs the live permissions against the snapshot the page
                        loaded with (see initialPermissionsRef) — only meaningful
                        once there's a saved baseline to compare against, so this
                        stays hidden entirely while creating a brand-new role.
                        `margin-right: auto` absorbs the row's leftover space so it
                        sits at the left while Cancel/Save stay pinned to the right. */}
                    {isEdit && changesCount > 0 && (
                        <div className={styles.changesBadge}>
                            <span className={styles.changesDot} />
                            <Text style={{ fontWeight: 700 }}>{t('roleFormChangesSummaryTitle', { count: changesCount })}</Text>
                            <Text className={styles.secondaryText}>
                                {t('roleFormChangesSummaryDetail', {
                                    added: permissionChanges.added.length,
                                    removed: permissionChanges.removed.length,
                                })}
                            </Text>
                            <Button design="Transparent" onClick={(e) => setChangesAnchorEl(e.currentTarget as HTMLElement)}>
                                {t('roleFormViewChanges')}
                            </Button>
                        </div>
                    )}

                    <Button onClick={cancel}>CANCEL</Button>
                    <Button type="Submit" design="Emphasized" disabled={processing || !hasChanges} loading={processing} loadingDelay={0}>
                        {processing ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </form>
        </AppLayout>
    );
}

function FieldLabel({ htmlFor, required = false, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
    return (
        <Label
            for={htmlFor}
            required={required}
            showColon={false}
            wrappingType="Normal"
            style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}
        >
            {children}
        </Label>
    );
}

/** error (สีแดง) ถ้ามี ไม่งั้นแสดง hint ปกติ — แทน helperText ของ MUI TextField */
function HelperText({ error, children }: { error?: string; children?: ReactNode }) {
    const content = error ?? children;
    if (!content) return null;
    return <span className={error ? `${styles.helper} ${styles.helperError}` : styles.helper}>{content}</span>;
}

function ExpandToggle({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
    const label = expanded ? 'Collapse' : 'Expand';
    return (
        <Button
            design="Transparent"
            icon={expanded ? 'navigation-up-arrow' : 'navigation-down-arrow'}
            tooltip={label}
            accessibleName={label}
            onClick={onClick}
        />
    );
}

/** หัว section แบบพับได้ของตาราง Attribute Access (คลิกทั้งแถวเพื่อพับ/ขยาย) */
function SectionHeader({ expanded, onToggle, children }: { expanded: boolean; onToggle: () => void; children: ReactNode }) {
    return (
        <div className={styles.sectionHeader} onClick={onToggle}>
            <Icon name={expanded ? 'navigation-up-arrow' : 'navigation-down-arrow'} className={styles.sectionHeaderIcon} />
            <span className={styles.sectionHeaderTitle}>{children}</span>
        </div>
    );
}

function SearchInput({
    value,
    onChange,
    placeholder,
    style,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    style?: CSSProperties;
}) {
    return (
        <Input
            value={value}
            placeholder={placeholder}
            showClearIcon
            icon={<Icon name="search" />}
            onInput={(e) => onChange(e.target.value)}
            style={{ width: 280, ...style }}
        />
    );
}
