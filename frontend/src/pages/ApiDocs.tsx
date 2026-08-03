import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Search,
  Loader2,
  BookOpen,
  Hash,
  ArrowLeftRight,
  Box,
  Server,
  AlertTriangle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const METHOD_COLORS: Record<string, string> = {
  get: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400",
  post: "bg-sky-500/10 text-sky-600 ring-sky-500/25 dark:text-sky-400",
  put: "bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400",
  patch: "bg-violet-500/10 text-violet-600 ring-violet-500/25 dark:text-violet-400",
  delete: "bg-rose-500/10 text-rose-600 ring-rose-500/25 dark:text-rose-400",
};

const METHOD_WIDTH: Record<string, string> = {
  get: "w-14",
  post: "w-14",
  put: "w-14",
  patch: "w-16",
  delete: "w-16",
};

function refName(ref?: string) {
  return ref && ref.startsWith("#/components/schemas/") ? ref.split("/").pop() : ref;
}

function typeLabel(schema?: any, schemas?: any) {
  if (!schema) return "object";
  if (schema.$ref) return refName(schema.$ref);
  if (schema.type === "array") {
    const inner = typeLabel(schema.items, schemas);
    return `${inner}[]`;
  }
  if (schema.type) return schema.type;
  if (schema.properties) return "object";
  return "any";
}

/**
 * In-app API documentation, rendered with Batua's own theme instead of the
 * stock Swagger UI. Fetches the OpenAPI spec from the backend (ENABLE_DOCS=1)
 * and groups endpoints by domain tag.
 */
export default function ApiDocs() {
  const specQuery = useQuery({
    queryKey: ["openapi-spec"],
    queryFn: async () => {
      const { data } = await api.get("/openapi.json");
      return data;
    },
    retry: 1,
  });

  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [showSchemas, setShowSchemas] = React.useState(false);

  const spec: any = specQuery.data;
  const schemas: any = spec?.components?.schemas ?? {};

  const groups = React.useMemo(() => {
    if (!spec?.paths) return [];
    const map = new Map<string, { method: string; path: string; op: any }[]>();
    for (const [path, item] of Object.entries<any>(spec.paths)) {
      for (const [method, op] of Object.entries<any>(item ?? {})) {
        if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
        const tag = op.tags?.[0] ?? "general";
        if (!map.has(tag)) map.set(tag, []);
        map.get(tag)!.push({ method, path, op });
      }
    }
    const q = query.trim().toLowerCase();
    const groups = [...map.entries()].map(([tag, ops]) => ({
      tag,
      ops: q
        ? ops.filter((o) => o.path.toLowerCase().includes(q) || o.op.summary?.toLowerCase().includes(q))
        : ops,
    }));
    return groups
      .filter((g) => g.ops.length > 0)
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }, [spec, query]);

  const totalEndpoints = React.useMemo(
    () => (spec?.paths ? Object.values<any>(spec.paths).reduce((n, p) => n + Object.keys(p ?? {}).filter((k) => METHOD_COLORS[k]).length, 0) : 0),
    [spec]
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="API Reference"
        subtitle={`Live OpenAPI documentation for the Batua backend · ${totalEndpoints} endpoints across ${groups.length} domains`}
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowSchemas((s) => !s)}>
            <Box className="h-4 w-4" /> Models
          </Button>
        }
      />

      {specQuery.isLoading && (
        <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading API spec…
        </div>
      )}

      {specQuery.isError && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="max-w-sm text-sm text-muted-foreground">
            The API spec is only served when <code className="font-mono text-xs">ENABLE_DOCS=1</code> on the
            backend. Start the backend with docs enabled, then reload this page.
          </p>
        </div>
      )}

      {spec && (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter endpoints… (e.g. transactions, budget)"
              className="pl-9"
            />
          </div>

          {/* Tag groups */}
          {groups.map(({ tag, ops }) => (
            <section key={tag} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <header className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Server className="h-4 w-4" />
                </span>
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">{tag}</h2>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {ops.length}
                </span>
              </header>
              <div className="divide-y divide-border">
                {ops.map(({ method, path, op }) => {
                  const key = `${method} ${path}`;
                  const isOpen = expanded.has(key);
                  return (
                    <div key={key}>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                      >
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center justify-center rounded-md px-0 py-0.5 text-xs font-bold uppercase ring-1 ring-inset",
                            METHOD_WIDTH[method],
                            METHOD_COLORS[method] ?? "bg-muted text-muted-foreground"
                          )}
                        >
                          {method}
                        </span>
                        <code className="min-w-0 truncate font-mono text-sm text-foreground">{path}</code>
                        {op.summary && (
                          <span className="hidden truncate text-xs text-muted-foreground sm:inline">{op.summary}</span>
                        )}
                        <ChevronDown
                          className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                        />
                      </button>
                      {isOpen && (
                        <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4 sm:px-6">
                          {op.summary && <p className="text-sm text-foreground">{op.summary}</p>}
                          {op.description && <p className="text-xs leading-relaxed text-muted-foreground">{op.description}</p>}

                          {(op.parameters?.length ?? 0) > 0 && (
                            <div>
                              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <Hash className="h-3.5 w-3.5" /> Parameters
                              </h4>
                              <div className="overflow-hidden rounded-lg border border-border bg-card">
                                {op.parameters.map((p: any) => (
                                  <div key={`${p.in}-${p.name}`} className="flex items-start gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                                    <code className="shrink-0 font-mono text-xs font-semibold text-foreground">{p.name}</code>
                                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">{p.in}</span>
                                    {p.required && <span className="shrink-0 text-[10px] font-semibold uppercase text-rose-500">required</span>}
                                    <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{typeLabel(p.schema)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {op.requestBody && (
                            <SchemaBlock
                              title="Request body"
                              schema={op.requestBody?.content?.["application/json"]?.schema}
                              schemas={schemas}
                            />
                          )}

                          {op.responses && (
                            <div>
                              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <ArrowLeftRight className="h-3.5 w-3.5" /> Responses
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries<any>(op.responses).map(([code, res]) => (
                                  <span
                                    key={code}
                                    className={cn(
                                      "rounded-md px-2 py-1 font-mono text-xs ring-1 ring-inset",
                                      code.startsWith("2")
                                        ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
                                        : code.startsWith("4") || code.startsWith("5")
                                        ? "bg-rose-500/10 text-rose-600 ring-rose-500/25 dark:text-rose-400"
                                        : "bg-muted text-muted-foreground ring-border"
                                    )}
                                  >
                                    {code}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {groups.length === 0 && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Search className="h-6 w-6" />
              <p className="text-sm">No endpoints match “{query}”.</p>
            </div>
          )}

          {/* Models / schemas */}
          {showSchemas && (
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <header className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Box className="h-4 w-4" />
                </span>
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">Data models</h2>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {Object.keys(schemas).length}
                </span>
              </header>
              <div className="divide-y divide-border">
                {Object.entries<any>(schemas).map(([name, schema]) => (
                  <div key={name}>
                    <button
                      type="button"
                      onClick={() => toggle(`schema:${name}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                    >
                      <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <code className="font-mono text-sm font-semibold text-foreground">{name}</code>
                      <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {typeLabel(schema)}
                      </span>
                      <ChevronDown
                        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded.has(`schema:${name}`) && "rotate-180")}
                      />
                    </button>
                    {expanded.has(`schema:${name}`) && (
                      <div className="border-t border-border bg-muted/20 px-4 py-3 sm:px-6">
                        {schema.description && <p className="mb-2 text-xs text-muted-foreground">{schema.description}</p>}
                        {schema.properties ? (
                          <div className="overflow-hidden rounded-lg border border-border bg-card">
                            {Object.entries<any>(schema.properties).map(([prop, ps]) => {
                              const req = schema.required?.includes(prop);
                              return (
                                <div key={prop} className="flex items-start gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                                  <code className="shrink-0 font-mono text-xs font-semibold text-foreground">{prop}</code>
                                  {req && <span className="shrink-0 text-[10px] font-semibold uppercase text-rose-500">required</span>}
                                  <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{typeLabel(ps, schemas)}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No properties — {typeLabel(schema)}.</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SchemaBlock({ title, schema, schemas }: { title: string; schema?: any; schemas: any }) {
  const name = schema?.$ref ? refName(schema.$ref) : undefined;
  const resolved = name ? schemas[name] : schema;
  const props = resolved?.properties ?? schema?.properties;
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Box className="h-3.5 w-3.5" /> {title}
      </h4>
      {name && <code className="mb-2 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{name}</code>}
      {props ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {Object.entries<any>(props).map(([prop, ps]) => {
            const req = resolved?.required?.includes(prop);
            return (
              <div key={prop} className="flex items-start gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                <code className="shrink-0 font-mono text-xs font-semibold text-foreground">{prop}</code>
                {req && <span className="shrink-0 text-[10px] font-semibold uppercase text-rose-500">required</span>}
                <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{typeLabel(ps, schemas)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{typeLabel(schema ?? resolved, schemas)}</p>
      )}
    </div>
  );
}
