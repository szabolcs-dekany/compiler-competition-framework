import type { SourceFileWithTestDetails, TestCaseBlueprint } from '@evaluator/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckCircle, Upload, MoreVertical, History, FileCode } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { UploadSourceFileDialog } from './upload-source-file-dialog';
import { VersionHistoryDialog } from './version-history-dialog';

interface SourceFileCardProps {
  testCase: TestCaseBlueprint;
  sourceFile: SourceFileWithTestDetails | undefined;
  teamId: string;
}

export function SourceFileCard({ testCase, sourceFile, teamId }: SourceFileCardProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  return (
    <>
      <Card className={`relative ${sourceFile ? 'border-green-500/50' : 'border-dashed'}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {sourceFile ? (
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : (
                  <FileCode className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="font-medium truncate">{testCase.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {testCase.id} - Difficulty {testCase.difficulty}
              </p>
              {sourceFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  v{sourceFile.version} - {formatDistanceToNow(new Date(sourceFile.uploadedAt), { addSuffix: true })}
                </p>
              )}
            </div>
            {sourceFile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setVersionHistoryOpen(true)}>
                    <History className="h-4 w-4 mr-2" />
                    Version History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setUploadDialogOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Replace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUploadDialogOpen(true)}
                className="h-8"
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <UploadSourceFileDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        teamId={teamId}
        testCase={testCase}
        existingFile={sourceFile}
      />

      {sourceFile && (
        <VersionHistoryDialog
          sourceFile={sourceFile}
          open={versionHistoryOpen}
          onOpenChange={setVersionHistoryOpen}
        />
      )}
    </>
  );
}
