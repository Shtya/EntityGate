import { FileText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/dates";
import { Avatar } from "@/components/ui/misc";
import { FormButton } from "@/components/patterns/form-dialog";
import { EmptyState } from "@/components/patterns/states";

export interface CommentRow {
  id: string;
  body: string;
  createdAt: Date;
  author: { name: string };
  attachment: { id: string; filename: string } | null;
}

/** Comments and completion evidence for tasks and cases. */
export async function CommentThread({ comments, endpoint, canPost }: { comments: CommentRow[]; endpoint: string; canPost: boolean }) {
  const t = await getTranslations("comments");
  const locale = await getLocale();
  return (
    <>
      {comments.length === 0 ? (
        <EmptyState compact title={t("empty")} />
      ) : (
        <ul>
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 border-b border-border px-5 py-3.5 last:border-0">
              <Avatar name={c.author.name} size={26} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{c.author.name}</span> <span className="text-xs text-faint num">{formatDateTime(c.createdAt, locale)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                {c.attachment && (
                  <a className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`/api/v1/attachments/${c.attachment.id}`}>
                    <FileText className="size-3.5" /> {c.attachment.filename}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canPost && (
        <div className="border-t border-border p-3">
          <FormButton
            size="sm"
            variant="secondary"
            label={t("add")}
            title={t("add")}
            endpoint={endpoint}
            submitLabel={t("post")}
            fields={[
              { name: "body", label: t("body"), type: "textarea", required: true },
              { name: "attachmentId", label: t("file"), type: "file", wide: true },
            ]}
          />
        </div>
      )}
    </>
  );
}
