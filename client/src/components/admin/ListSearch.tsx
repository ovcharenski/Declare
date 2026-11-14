import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholderKey: "searchSuggestions" | "searchUsers" | "searchTags";
  testId?: string;
};

const PLACEHOLDER_FALLBACKS: Record<Props["placeholderKey"], string> = {
  searchSuggestions: "Search suggestions...",
  searchUsers: "Search users...",
  searchTags: "Search tags...",
};

export function ListSearch({
  value,
  onChange,
  placeholderKey,
  testId = "list-search",
}: Props) {
  const { t } = useTranslation("common");

  const placeholder = t(`search.${placeholderKey}`, {
    defaultValue: PLACEHOLDER_FALLBACKS[placeholderKey],
  });

  return (
    <div className="relative w-full sm:w-72">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        data-testid={testId}
      />
    </div>
  );
}
