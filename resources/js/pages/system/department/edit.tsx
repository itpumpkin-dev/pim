import DepartmentFormPage from '@/components/system/department-form';

interface EditDepartmentProps {
    department: {
        id: number;
        name: string;
        enabled: boolean;
    };
}

export default function DepartmentEdit({ department }: EditDepartmentProps) {
    return <DepartmentFormPage department={department} />;
}
