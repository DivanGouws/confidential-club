import { type HTMLAttributes } from "react";

type SectionHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
};

export function SectionHeader({ title, className, ...rest }: SectionHeaderProps) {
  return (
    <div className={className} {...rest}>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <div className="mt-2 border-b border-zinc-300 dark:border-zinc-700 -mx-6" />
    </div>
  );
}


