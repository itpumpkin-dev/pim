import type { CSSProperties, HTMLAttributes } from 'react';

type InputErrorProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & { message?: string; style?: CSSProperties; className?: string };

export default function InputError({ message, style, ...props }: InputErrorProps) {
    return message ? (
        <div role="alert" style={{ color: 'var(--sapNegativeTextColor)', fontSize: 'var(--sapFontSize)', ...style }} {...props}>
            {message}
        </div>
    ) : null;
}
