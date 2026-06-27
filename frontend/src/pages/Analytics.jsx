import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TimelineChart,
  CategoryDonut,
  MerchantsBar,
  SpendingCalendar,
  CategoryTreemap,
} from "@/components/Charts";
import { api } from "@/lib/utils-finance";

export default function Analytics() {
  const [tab, setTab] = React.useState("trend");
  const [timeline, setTimeline] = React.useState(null);
  const [categories, setCategories] = React.useState(null);
  const [merchants, setMerchants] = React.useState(null);
  const [heatmap, setHeatmap] = React.useState(null);
  const [treemap, setTreemap] = React.useState(null);

  React.useEffect(() => {
    api.get("/analytics/timeline").then((r) => setTimeline(r.data.series));
    api.get("/analytics/category-breakdown").then((r) => setCategories(r.data.data));
    api.get("/analytics/top-merchants?limit=10").then((r) => setMerchants(r.data.data));
    api.get("/analytics/heatmap").then((r) => setHeatmap(r.data));
    api.get("/analytics/treemap").then((r) => setTreemap(r.data.data));
  }, []);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList data-testid="analytics-tabs">
        <TabsTrigger value="trend" data-testid="tab-trend">Trend</TabsTrigger>
        <TabsTrigger value="categories" data-testid="tab-categories">Categories</TabsTrigger>
        <TabsTrigger value="merchants" data-testid="tab-merchants">Merchants</TabsTrigger>
        <TabsTrigger value="heatmap" data-testid="tab-heatmap">Calendar</TabsTrigger>
        <TabsTrigger value="treemap" data-testid="tab-treemap">Treemap</TabsTrigger>
      </TabsList>

      <TabsContent value="trend">
        <Card>
          <CardHeader><CardTitle>Monthly Income vs Expense</CardTitle></CardHeader>
          <CardContent>{timeline === null ? <Skeleton className="h-[300px]" /> : <TimelineChart data={timeline} />}</CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="categories">
        <Card>
          <CardHeader><CardTitle>Category Breakdown</CardTitle></CardHeader>
          <CardContent>{categories === null ? <Skeleton className="h-[340px]" /> : <CategoryDonut data={categories} />}</CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="merchants">
        <Card>
          <CardHeader><CardTitle>Top Merchants by Spend</CardTitle></CardHeader>
          <CardContent>{merchants === null ? <Skeleton className="h-[300px]" /> : <MerchantsBar data={merchants} />}</CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="heatmap">
        <Card>
          <CardHeader>
            <CardTitle>Spending Calendar</CardTitle>
            <p className="text-sm text-muted-foreground">
              3 months at a glance — darker days = more spent. Hover a day for the amount spent and the number of transactions.
            </p>
          </CardHeader>
          <CardContent>
            {heatmap === null ? (
              <Skeleton className="h-[200px]" />
            ) : (
              <SpendingCalendar days={heatmap.days} max={heatmap.max} />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="treemap">
        <Card>
          <CardHeader>
            <CardTitle>Category → Merchant Treemap</CardTitle>
          </CardHeader>
          <CardContent>{treemap === null ? <Skeleton className="h-[360px]" /> : <CategoryTreemap data={treemap} />}</CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
