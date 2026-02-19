import { User, Building2, Database, Bell, Key, Shield } from 'lucide-react';

const sections = [
  {
    title: 'Profile',
    description: 'Manage your account details and preferences',
    icon: User,
    fields: [
      { label: 'Display Name', value: 'Tyler Drinkard', type: 'text' },
      { label: 'Email', value: 'tyler.creatorscorner@gmail.com', type: 'email' },
      { label: 'Role', value: 'Owner', type: 'badge' },
      { label: 'Timezone', value: 'America/Chicago (CST)', type: 'text' },
    ],
  },
  {
    title: 'Brand Management',
    description: 'Configure brands and their settings',
    icon: Building2,
    brands: [
      { name: 'JiYu', color: '#E91E8C', status: 'active' },
      { name: 'Cata-Kor', color: '#00C853', status: 'active' },
      { name: "Physician's Choice", color: '#2196F3', status: 'active' },
      { name: 'TopLux', color: '#FF9800', status: 'pending' },
    ],
  },
  {
    title: 'Data Sources',
    description: 'Connected data integrations',
    icon: Database,
    integrations: [
      { name: 'TikTok Shop API', status: 'connected', lastSync: '2 hours ago' },
      { name: 'Supabase', status: 'connected', lastSync: 'Real-time' },
      { name: 'Google Sheets', status: 'disconnected', lastSync: 'N/A' },
    ],
  },
  {
    title: 'Notifications',
    description: 'Configure alerts and notification preferences',
    icon: Bell,
    notifications: [
      { label: 'Daily Performance Summary', enabled: true },
      { label: 'New Creator Alerts', enabled: true },
      { label: 'GMV Milestone Alerts', enabled: false },
      { label: 'Weekly Report Email', enabled: true },
    ],
  },
  {
    title: 'API Keys',
    description: 'Manage API access tokens',
    icon: Key,
    keys: [
      { name: 'Production Key', prefix: 'tempo_live_...a3f2', created: 'Jan 15, 2026' },
      { name: 'Development Key', prefix: 'tempo_test_...8b1c', created: 'Feb 1, 2026' },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and application configuration
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.title} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-6 border-b border-border flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <section.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">{section.title}</h2>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
          </div>
          <div className="p-6">
            {/* Profile fields */}
            {'fields' in section && section.fields && (
              <div className="space-y-4">
                {section.fields.map((field) => (
                  <div key={field.label} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <label className="text-sm text-muted-foreground w-32 shrink-0">{field.label}</label>
                    {field.type === 'badge' ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">
                        <Shield className="h-3 w-3 mr-1" /> {field.value}
                      </span>
                    ) : (
                      <div className="flex-1">
                        <input
                          type={field.type}
                          defaultValue={field.value}
                          disabled
                          className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm disabled:opacity-60"
                        />
                      </div>
                    )}
                  </div>
                ))}
                <button className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors opacity-50 cursor-not-allowed">
                  Save Changes
                </button>
              </div>
            )}

            {/* Brand management */}
            {'brands' in section && section.brands && (
              <div className="space-y-3">
                {section.brands.map((brand) => (
                  <div key={brand.name} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-border transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: brand.color }}>
                        {brand.name.charAt(0)}
                      </div>
                      <span className="font-medium text-sm">{brand.name}</span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      brand.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {brand.status}
                    </span>
                  </div>
                ))}
                <button className="mt-2 px-4 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  + Add Brand
                </button>
              </div>
            )}

            {/* Data sources */}
            {'integrations' in section && section.integrations && (
              <div className="space-y-3">
                {section.integrations.map((int) => (
                  <div key={int.name} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                    <div>
                      <p className="font-medium text-sm">{int.name}</p>
                      <p className="text-xs text-muted-foreground">Last sync: {int.lastSync}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      int.status === 'connected' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {int.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Notifications */}
            {'notifications' in section && section.notifications && (
              <div className="space-y-3">
                {section.notifications.map((notif) => (
                  <div key={notif.label} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                    <span className="text-sm">{notif.label}</span>
                    <div className={`relative w-11 h-6 rounded-full transition-colors cursor-not-allowed ${
                      notif.enabled ? 'bg-primary' : 'bg-muted'
                    }`}>
                      <div className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                        notif.enabled ? 'left-6' : 'left-1'
                      }`} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* API keys */}
            {'keys' in section && section.keys && (
              <div className="space-y-3">
                {section.keys.map((key) => (
                  <div key={key.name} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                    <div>
                      <p className="font-medium text-sm">{key.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{key.prefix}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Created {key.created}</p>
                  </div>
                ))}
                <button className="mt-2 px-4 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  + Generate New Key
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
