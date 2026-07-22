import { SvgIconComponent } from '@mui/icons-material';

export interface Auth {
    user: User;
    permissions: string[];
}

export interface BreadcrumbItem {
    title: string;
    href: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export interface NavItem {
    title: string;
    url?: string;
    icon?: SvgIconComponent | null;
    isActive?: boolean;
    items?: NavItem[];
    permission?: string;
}

export interface SharedData {
    name: string;
    quote: { message: string; author: string };
    auth: Auth;
    status?: string | null;
    success?: string | null;
    [key: string]: unknown;
}

export interface User {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    name: string;
    employee_id: string | null;
    enabled: boolean;
    email: string;
    avatar_url?: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown; // This allows for additional properties...
}
