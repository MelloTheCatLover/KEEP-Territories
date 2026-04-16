type ErrorBannerProps = {
  message: string | null | undefined;
};

export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div className="bg-danger-bg text-danger-text text-sm px-3 py-2 rounded-sm border border-danger">
      {message}
    </div>
  );
}
