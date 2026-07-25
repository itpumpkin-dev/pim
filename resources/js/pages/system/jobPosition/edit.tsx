import JobPositionFormPage from '@/components/system/job-position-form';

interface EditJobPositionProps {
    jobPosition: {
        id: number;
        name: string;
        enabled: boolean;
    };
}

export default function JobPositionEdit({ jobPosition }: EditJobPositionProps) {
    return <JobPositionFormPage jobPosition={jobPosition} />;
}
