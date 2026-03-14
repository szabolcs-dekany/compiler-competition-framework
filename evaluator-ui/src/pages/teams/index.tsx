import { useSuspenseQuery } from '@tanstack/react-query';
import { teamQueries } from '@/lib/queries';
import { TeamsTable } from '@/components/teams/teams-table';
import { CreateTeamDialog } from '@/components/teams/create-team-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function TeamsPage() {
  const { data: teams } = useSuspenseQuery(teamQueries.list());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="text-muted-foreground">Manage competing teams</p>
        </div>
        <CreateTeamDialog>
          <Button>Add Team</Button>
        </CreateTeamDialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Teams</CardTitle>
          <CardDescription>
            {teams.length} team{teams.length !== 1 ? 's' : ''} registered
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamsTable teams={teams} />
        </CardContent>
      </Card>
    </div>
  );
}
