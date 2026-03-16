import { useState, useRef } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { DockerfileDto } from '@evaluator/shared';
import { teamQueries } from '@/lib/queries';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUploadDockerfile, useReplaceDockerfile } from '@/lib/hooks/use-dockerfiles-mutations';
import { toast } from 'sonner';

const DOCKERFILE_FILENAME = 'Dockerfile';

interface UploadDockerfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId?: string;
  existingDockerfile?: DockerfileDto;
}

export function UploadDockerfileDialog({
  open,
  onOpenChange,
  teamId: initialTeamId,
  existingDockerfile,
}: UploadDockerfileDialogProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadDockerfile = useUploadDockerfile();
  const replaceDockerfile = useReplaceDockerfile();

  const { data: teams } = useSuspenseQuery(teamQueries.list());

  const isReplacing = !!existingDockerfile;
  const isPending = uploadDockerfile.isPending || replaceDockerfile.isPending;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setError(null);
    if (selectedFile) {
      if (selectedFile.name !== DOCKERFILE_FILENAME) {
        setError(`File must be named exactly "${DOCKERFILE_FILENAME}"`);
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    if (!selectedTeamId) {
      toast.error('Please select a team');
      return;
    }

    try {
      if (isReplacing && existingDockerfile) {
        await replaceDockerfile.mutateAsync({
          id: existingDockerfile.id,
          file,
          teamId: selectedTeamId,
        });
        toast.success('Dockerfile replaced');
      } else {
        await uploadDockerfile.mutateAsync({
          teamId: selectedTeamId,
          file,
        });
        toast.success('Dockerfile uploaded');
      }
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleClose = () => {
    setFile(null);
    setError(null);
    setSelectedTeamId(initialTeamId ?? '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReplacing ? 'Replace' : 'Upload'} Dockerfile</DialogTitle>
          <DialogDescription>
            Upload a Dockerfile that defines the build environment for compiling source files.
            The file must be named exactly "{DOCKERFILE_FILENAME}".
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {!isReplacing && (
            <div className="grid gap-2">
              <Label htmlFor="team">Team</Label>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {existingDockerfile && (
            <div className="text-sm text-muted-foreground">
              Current version: v{existingDockerfile.version} ({(existingDockerfile.size / 1024).toFixed(1)} KB)
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="file">Dockerfile</Label>
            <Input
              ref={fileInputRef}
              id="file"
              type="file"
              onChange={handleFileChange}
              disabled={isPending}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            {file && !error && (
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
          <Button onClick={handleSubmit} disabled={isPending || !file || !!error || (!isReplacing && !selectedTeamId)}>
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
