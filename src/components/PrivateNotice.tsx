import Image from "next/image";

/** Shown instead of a private person's page or tree (see src/lib/consent.ts). */
export function PrivateNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center">
      <Image src="/icons/3d/lock.png" alt="" width={120} height={120} className="drop-shadow-xl" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted">{body}</p>
    </div>
  );
}
