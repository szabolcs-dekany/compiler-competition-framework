import { useState, useRef } from 'react';
import type { TestCaseBlueprint, SourceFileWithTestDetails } from '@evaluator/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUploadSourceFile, useReplaceSourceFile } from '@/lib/hooks/use-source-files-mutations';
import { toast } from 'sonner';

interface UploadSourceFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  testCase: TestCaseBlueprint;
  existingFile?: SourceFileWithTestDetails;
}

export function UploadSourceFileDialog({
  open,
  onOpenChange,
  teamId,
  testCase,
  existingFile,
}: UploadSourceFileDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSourceFile = useUploadSourceFile();
  const replaceSourceFile = useReplaceSourceFile();

  const isReplacing = !!existingFile;
  const isPending = uploadSourceFile.isPending || replaceSourceFile.isPending;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    try {
      if (isReplacing && existingFile) {
        await replaceSourceFile.mutateAsync({
          id: existingFile.id,
          file,
          teamId,
        });
        toast.success('Source file replaced');
      } else {
        await uploadSourceFile.mutateAsync({
          data: { teamId, testCaseId: testCase.id },
          file,
        });
        toast.success('Source file uploaded');
      }
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const handleClose = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReplacing ? 'Replace' : 'Upload'} Source File</DialogTitle>
          <DialogDescription>
            {testCase.name} ({testCase.id})
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {existingFile && (
            <div className="text-sm text-muted-foreground">
              Current file: {testCase.id}
              {existingFile.extension} (v{existingFile.version})
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="file">Source File</Label>
            <Input
              ref={fileInputRef}
              id="file"
              type="file"
              onChange={handleFileChange}
              disabled={isPending}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !file}>
            {isPending
              ? 'Uploading...'
              : isReplacing
                ? 'Replace'
                : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
