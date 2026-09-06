import { useState } from "react";
import { useGetDailyAnalytics, useGetVehicleUsageAnalytics, useGetAnalyticsSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Activity, BarChart2, PieChart as PieChartIcon } from "lucide-react";

export default function Analytics() {
  const [days, setDays] = useState(30);
  
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary();
  const { data: dailyData, isLoading: isLoadingDaily } = useGetDailyAnalytics({ days });
  const { data: usageData, isLoading: isLoadingUsage } = useGetVehicleUsageAnalytics({ limit: 10 });

  const summaryPieData = summary ? [
    { name: 'Authorized Entries', value: summary.entriesToday, color: 'hsl(var(--success))' },
    { name: 'Authorized Exits', value: summary.exitsToday, color: 'hsl(var(--primary))' },
    { name: 'Unauthorized', value: summary.unauthorizedToday, color: 'hsl(var(--destructive))' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-mono text-lg tracking-wider text-muted-foreground uppercase flex items-center gap-2">
          <BarChart2 className="h-5 w-5" /> Telemetry & Analysis
        </h2>
        <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
          <SelectTrigger className="w-[180px] font-mono text-sm bg-card border-border">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">LAST 7 DAYS</SelectItem>
            <SelectItem value="30">LAST 30 DAYS</SelectItem>
            <SelectItem value="90">LAST 90 DAYS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border bg-card/50 backdrop-blur col-span-2">
          <CardHeader>
            <CardTitle className="font-mono uppercase text-sm text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" /> Volume Trend ({days} Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingDaily ? (
              <Skeleton className="h-[350px] w-full" />
            ) : (
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData || []} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(val) => format(new Date(val), 'MMM d')} 
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ fontFamily: 'var(--font-mono)' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-mono)' }}
                    />
                    <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
                    <Bar dataKey="entries" name="Entries" fill="hsl(var(--success))" radius={[2, 2, 0, 0]} stackId="a" />
                    <Bar dataKey="exits" name="Exits" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} stackId="a" />
                    <Bar dataKey="unauthorized" name="Denied" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="font-mono uppercase text-sm text-muted-foreground flex items-center gap-2">
              <PieChartIcon className="h-4 w-4" /> Today's Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-[350px] w-full rounded-full" />
            ) : (
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summaryPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {summaryPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ fontFamily: 'var(--font-mono)' }}
                    />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 backdrop-blur col-span-full">
          <CardHeader>
            <CardTitle className="font-mono uppercase text-sm text-muted-foreground">Top 10 High-Frequency Vehicles</CardTitle>
            <CardDescription className="font-mono text-xs">Total historical access counts</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingUsage ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usageData || []} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis 
                      dataKey="plateNumber" 
                      type="category" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      width={80}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ fontFamily: 'var(--font-mono)' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-mono)' }}
                    />
                    <Bar dataKey="accessCount" name="Total Access Count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
