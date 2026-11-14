import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  onConfirm: () => void;
  disabled?: boolean;
  deleting?: boolean;
  label?: string;
  title?: string;
  description?: string;
  testId?: string;
};

export function DeleteConfirmButton({
  onConfirm,
  disabled = false,
  deleting = false,
  label,
  title,
  description,
  testId,
}: Props) {
  const { t } = useTranslation("common");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          disabled={disabled || deleting}
          data-testid={testId}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {deleting
            ? t("admin.common.deleting", { defaultValue: "Deleting…" })
            : (label ?? t("admin.common.delete", { defaultValue: "Delete" }))}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {title ??
              t("admin.common.deleteTitle", {
                defaultValue: "Delete permanently?",
              })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              t("admin.common.deleteDescription", {
                defaultValue:
                  "This action cannot be undone. The item will be permanently removed.",
              })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("admin.common.cancel", { defaultValue: "Cancel" })}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {t("admin.common.delete", { defaultValue: "Delete" })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
