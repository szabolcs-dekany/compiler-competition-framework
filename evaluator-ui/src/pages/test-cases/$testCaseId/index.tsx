import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import type { TestCaseBlueprint } from '@evaluator/shared';
import { testCaseQueries } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Shuffle, Zap, Clock, MemoryStick, FileText } from 'lucide-react';

const difficultyLabels = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
} as const;

const difficultyColors = {
  1: 'bg-green-500/10 text-green-500 border-green-500/20',
  2: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  3: 'bg-red-500/10 text-red-500 border-red-500/20',
} as const;

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="text-sm text-muted-foreground">{label}</div>
        <CardTitle className="text-2xl">{children}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function GeneratorSection({ tc }: { tc: TestCaseBlueprint }) {
  if (tc.mode !== 'generator' || !tc.generator_info) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shuffle className="h-5 w-5" />
          Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 text-sm">
          <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
            Randomized Inputs
          </Badge>
          <span className="text-muted-foreground">
            <strong>{tc.generator_info.runs}</strong> run{tc.generator_info.runs !== 1 ? 's' : ''}
          </span>
          <span className="text-muted-foreground">
            Seed: <strong>{tc.generator_info.seed}</strong>
          </span>
        </div>

        {tc.generator_info.inputs.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variable</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Min</TableHead>
                <TableHead>Max</TableHead>
                <TableHead>Choices</TableHead>
                <TableHead>Length</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tc.generator_info.inputs.map((input) => (
                <TableRow key={input.var}>
                  <TableCell className="font-mono">{input.var}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{input.type}</Badge>
                  </TableCell>
                  <TableCell>{input.min ?? '—'}</TableCell>
                  <TableCell>{input.max ?? '—'}</TableCell>
                  <TableCell>{input.choices ? input.choices.join(', ') : '—'}</TableCell>
                  <TableCell>{input.length ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function TestCaseDetailPage() {
  const { testCaseId } = useParams({ from: '/test-cases/$testCaseId' });
  const { data: tc } = useSuspenseQuery(testCaseQueries.detail(testCaseId));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/test-cases">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            {tc.id} — {tc.name}
            {tc.mode === 'generator' && (
              <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                Randomized
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">{tc.description}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="Category">
          <Badge variant="secondary">{tc.category}</Badge>
        </InfoCard>
        <InfoCard label="Difficulty">
          <Badge variant="outline" className={difficultyColors[tc.difficulty]}>
            {difficultyLabels[tc.difficulty]}
          </Badge>
        </InfoCard>
        <InfoCard label="Points">
          {tc.points}
          {tc.performance_bonus && tc.performance_threshold_ms !== null && (
            <span className="text-sm font-normal text-muted-foreground ml-1">
              (+{Math.floor(tc.points * 0.2)} bonus)
            </span>
          )}
        </InfoCard>
      </div>

      <GeneratorSection tc={tc} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Timeout:</span>
              <span className="font-medium">{tc.timeout_ms}ms</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MemoryStick className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Memory:</span>
              <span className="font-medium">{tc.max_memory_mb}MB</span>
            </div>
            {tc.performance_bonus && tc.performance_threshold_ms !== null && (
              <div className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-blue-500" />
                <span className="text-muted-foreground">Performance Bonus:</span>
                <span className="font-medium">+{Math.floor(tc.points * 0.2)} pts</span>
                <span className="text-muted-foreground">(threshold {tc.performance_threshold_ms}ms)</span>
              </div>
            )}
            {tc.args.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Args:</span>
                <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                  {tc.args.join(' ')}
                </code>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
