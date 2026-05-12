'use client';

export interface TabItem {
  key: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  selected: string;
  onSelect: (key: string) => void;
}

export function Tabs({ items, selected, onSelect }: TabsProps) {
  return (
    <nav role="tablist" className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
      {items.map((item) => {
        const isActive = item.key === selected;
        return (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelect(item.key)}
            className={
              'px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ' +
              (isActive
                ? 'border-neutral-900 text-neutral-900 dark:border-neutral-50 dark:text-neutral-50'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200')
            }
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
