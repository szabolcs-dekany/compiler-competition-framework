import { useSuspenseQuery } from '@tanstack/react-query';
import { sourceFileQueries } from '@/lib/queries';
import { useDownloadSourceFile } from '@/lib/hooks/use-source-files-mutations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Clock, FileCode } from 'lucide-react';
import type { SourceFileDto } from '@evaluator/shared';

interface VersionHistoryDialogProps {
  sourceFile: SourceFileDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

function truncateChecksum(checksum: string): string {
  return `${checksum.slice(0, 8)}...`;
}

export function VersionHistoryDialog({
  sourceFile,
  open,
  onOpenChange,
}: VersionHistoryDialogProps) {
  const { data: versions } = useSuspenseQuery(
    sourceFileQueries.versions(sourceFile.id),
  );
  const downloadMutation = useDownloadSourceFile();

  const handleDownload = (version: number) => {
    const filename = `${sourceFile.testCaseId}_v${version}${sourceFile.extension}`;
    downloadMutation.mutate({ id: sourceFile.id, version, filename });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            {sourceFile.testCaseId}
            {sourceFile.extension} - {versions.length} version(s)
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{v.version}</span>
                  {v.version === sourceFile.version && (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      Current
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(v.uploadedAt)}
                  </span>
                  <span>{formatBytes(v.size)}</span>
                  <span className="font-mono text-xs">
                    {truncateChecksum(v.checksum)}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDownload(v.version)}
                disabled={downloadMutation.isPending}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
