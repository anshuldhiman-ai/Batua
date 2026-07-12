import React from "react";
import { Link } from "react-router-dom";
import { ReceiptText, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatDate, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

export default function RecentTransactionsPanel({ transactions, loading }) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ReceiptText className="h-4 w-4 text-primary" />
          Recent Transactions
        </CardTitle>
        <Link
          to="/transactions"
          className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {!transactions?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No transactions in this period
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {transactions.map((t) => {
              const amt = Number(t.amount) || 0;
              const isCredit = amt >= 0;
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.description || "—"}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{formatDate(t.date)}</span>
                      {t.category && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 text-[9px]"
                          style={{ borderColor: categoryColor(t.category) }}
                        >
                          {t.category}
                        </Badge>
                      )}
                      {t.payment_method && <span>{t.payment_method}</span>}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      isCredit ? "text-primary" : "text-destructive"
                    )}
                  >
                    {isCredit ? "+" : "−"}
                    {formatINR(Math.abs(amt))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
