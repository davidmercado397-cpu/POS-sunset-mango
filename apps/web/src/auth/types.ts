export type AppModule = 'pos' | 'cash' | 'tips' | 'inventory' | 'purchases' | 'transfers' | 'kitchen' | 'tables' | 'reports';

export interface SessionData {
  user: {
    id: string;
    fullName: string;
    username: string;
    email: string | null;
    isSuperAdmin: boolean;
    role: { id: string; name: string } | null;
    permissions: string[];
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    brandName: string;
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    enabledModules: AppModule[];
  } | null;
  branches: { id: string; name: string; modules: AppModule[] }[];
}
