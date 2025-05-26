import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Database,
  Lock,
  Server,
  Shield,
  Zap,
  Bot,
  Activity,
  LineChart
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navigation */}
      <header className="bg-background border-b border-border sticky top-0 z-40">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">SOC-Inteligente</span>
          </div>
          <nav className="hidden md:flex gap-6">
            <a href="#funcionalidades" className="text-muted-foreground hover:text-foreground transition-colors">
              Funcionalidades
            </a>
            <a href="#planes" className="text-muted-foreground hover:text-foreground transition-colors">
              Planes
            </a>
            <a href="#beneficios" className="text-muted-foreground hover:text-foreground transition-colors">
              Beneficios
            </a>
          </nav>
          <div className="flex gap-4">
            <Link to="/auth">
              <Button variant="outline">Iniciar Sesión</Button>
            </Link>
            <Link to="/auth?action=register&plan=free">
              <Button>Registrarse</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-24 bg-gradient-to-r from-primary/10 to-background">
          <div className="container grid md:grid-cols-2 gap-12 items-center">
            <div className="flex flex-col gap-6">
              <h1 className="text-4xl md:text-5xl font-bold leading-tight">
                Centro de Operaciones de Seguridad <span className="text-primary">Potenciado por IA</span>
              </h1>
              <p className="text-xl text-muted-foreground">
                Detecta, analiza y responde a amenazas de seguridad en tiempo real con nuestra 
                plataforma avanzada de SOC que utiliza inteligencia artificial.
              </p>
              <div className="flex gap-4 pt-4">
                <Link to="/auth?action=register&plan=free">
                  <Button size="lg" className="gap-2">
                    Comenzar ahora
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#planes">
                  <Button size="lg" variant="outline">
                    Ver planes
                  </Button>
                </a>
              </div>
            </div>
            <div className="bg-card rounded-lg shadow-lg p-4 border border-border relative overflow-hidden">
              <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-primary/10 rounded-full"></div>
              <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/10 rounded-full"></div>
              <img 
                src="/public/homeimagen.png" 
                alt="Vista previa del dashboard" 
                className="rounded-md border border-border shadow-md w-full"
              />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="funcionalidades" className="py-20 bg-background">
          <div className="container">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Funcionalidades Principales</h2>
              <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
                Nuestra plataforma SOC-Inteligente ofrece herramientas avanzadas para mantener 
                la seguridad de su organización, con análisis inteligente de amenazas y respuesta automatizada.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              <FeatureCard 
                icon={<Database className="h-10 w-10 text-primary" />}
                title="Integración de Datos"
                description="Conecte con múltiples fuentes de datos para una visión completa de su seguridad."
              />
              <FeatureCard 
                icon={<Bot className="h-10 w-10 text-primary" />}
                title="Análisis con IA"
                description="Detección avanzada de amenazas utilizando algoritmos de inteligencia artificial."
              />
              <FeatureCard 
                icon={<Activity className="h-10 w-10 text-primary" />}
                title="Monitoreo en Tiempo Real"
                description="Observe y analice incidentes de seguridad en tiempo real con alertas instantáneas."
              />
              <FeatureCard 
                icon={<Zap className="h-10 w-10 text-primary" />}
                title="Respuesta Automatizada"
                description="Automatice las acciones de respuesta con playbooks predefinidos o personalizados."
              />
              <FeatureCard 
                icon={<LineChart className="h-10 w-10 text-primary" />}
                title="Analítica Avanzada"
                description="Obtenga insights profundos sobre tendencias y patrones de amenazas."
              />
              <FeatureCard 
                icon={<Server className="h-10 w-10 text-primary" />}
                title="Agentes Multi-Plataforma"
                description="Instale agentes en Windows, Linux y macOS para monitoreo completo."
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="planes" className="py-20 bg-muted/30">
          <div className="container">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Planes Disponibles</h2>
              <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
                Elija el plan que mejor se adapte a las necesidades de seguridad de su organización.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <PricingCard
                title="Free"
                price="$0"
                description="Para individuos y proyectos pequeños"
                features={[
                  "1 agente de monitoreo",
                  "Alertas básicas",
                  "Dashboard principal",
                  "Detección de amenazas básica",
                  "Soporte comunitario"
                ]}
                buttonText="Registrarse Gratis"
                buttonLink="/auth?action=register&plan=free"
                popular={false}
              />
              <PricingCard
                title="Professional"
                price="$99"
                period="/mes"
                description="Para equipos y empresas medianas"
                features={[
                  "10 agentes de monitoreo",
                  "Alertas avanzadas",
                  "Dashboard completo",
                  "Análisis con IA",
                  "Integraciones de datos",
                  "Playbooks SOAR",
                  "Soporte prioritario"
                ]}
                buttonText="Suscribirse Ahora"
                buttonLink="/auth?action=register&plan=pro"
                popular={true}
              />
              <PricingCard
                title="Enterprise"
                price="$299"
                period="/mes"
                description="Para grandes organizaciones"
                features={[
                  "Agentes ilimitados",
                  "Alertas personalizadas",
                  "Dashboard personalizable",
                  "Análisis con IA avanzado",
                  "Todas las integraciones",
                  "Playbooks personalizados",
                  "Soporte 24/7",
                  "Implementación asistida"
                ]}
                buttonText="Contactar Ventas"
                buttonLink="/auth?action=register&plan=enterprise"
                popular={false}
              />
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section id="beneficios" className="py-20 bg-gradient-to-b from-background to-muted/30">
          <div className="container">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Beneficios de SOC-Inteligente</h2>
              <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
                Descubra cómo nuestra plataforma transforma la manera en que las organizaciones 
                detectan y responden a las amenazas de seguridad.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <img 
                  src="/threat-intel-preview.png" 
                  alt="Análisis de Inteligencia de Amenazas" 
                  className="rounded-lg border border-border shadow-lg w-full"
                />
              </div>
              <div className="space-y-6">
                <BenefitItem 
                  title="Reducción del tiempo de detección"
                  description="Reduzca significativamente el MTTD (Mean Time to Detect) con nuestro sistema de alertas inteligente."
                />
                <BenefitItem 
                  title="Automatización de respuestas"
                  description="Automatice las respuestas a incidentes comunes para resolver problemas más rápido y con menos recursos."
                />
                <BenefitItem 
                  title="Visibilidad completa"
                  description="Obtenga una visión unificada de todos los aspectos de seguridad de su organización en un solo panel."
                />
                <BenefitItem 
                  title="Análisis predictivo"
                  description="Anticipe posibles amenazas antes de que ocurran con nuestro análisis predictivo impulsado por IA."
                />
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-primary text-primary-foreground">
          <div className="container text-center">
            <h2 className="text-3xl font-bold mb-6">Comience a proteger su organización hoy</h2>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto mb-8">
              Únase a las organizaciones que confían en SOC-Inteligente para mantenerse seguras 
              en un entorno de amenazas en constante evolución.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/auth?action=register&plan=free">
                <Button 
                  size="lg" 
                  variant="secondary" 
                  className="gap-2 bg-white text-primary hover:bg-white/90"
                >
                  Registrarse Ahora
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="gap-2 border-white text-white hover:bg-white/10"
                >
                  Iniciar Sesión
                  <Lock className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-muted py-12">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div className="space-y-4 max-w-sm">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <span className="font-bold text-xl">SOC-Inteligente</span>
              </div>
              <p className="text-muted-foreground">
                Plataforma de Centro de Operaciones de Seguridad potenciada por Inteligencia Artificial, 
                para la detección y respuesta avanzada a amenazas.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
              <div className="space-y-3">
                <h3 className="font-medium">Producto</h3>
                <ul className="space-y-2">
                  <FooterLink href="#funcionalidades">Funcionalidades</FooterLink>
                  <FooterLink href="#planes">Planes</FooterLink>
                  <FooterLink href="#beneficios">Beneficios</FooterLink>
                </ul>
              </div>
              <div className="space-y-3">
                <h3 className="font-medium">Soporte</h3>
                <ul className="space-y-2">
                  <FooterLink href="#">Documentación</FooterLink>
                  <FooterLink href="#">Guías</FooterLink>
                  <FooterLink href="#">Estado del Servicio</FooterLink>
                </ul>
              </div>
              <div className="space-y-3">
                <h3 className="font-medium">Legal</h3>
                <ul className="space-y-2">
                  <FooterLink href="#">Términos de Servicio</FooterLink>
                  <FooterLink href="#">Política de Privacidad</FooterLink>
                  <FooterLink href="#">Cumplimiento</FooterLink>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-6 border-t border-border text-center text-muted-foreground text-sm">
            &copy; {new Date().getFullYear()} SOC-Inteligente. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}

// Component for feature cards
function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="group hover:shadow-md transition-all">
      <CardContent className="pt-6">
        <div className="mb-4 p-3 rounded-lg bg-muted inline-block">
          {icon}
        </div>
        <h3 className="text-lg font-medium mb-2">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

// Component for pricing cards
function PricingCard({ 
  title, 
  price, 
  period, 
  description, 
  features, 
  buttonText, 
  buttonLink, 
  popular 
}: { 
  title: string, 
  price: string, 
  period?: string, 
  description: string, 
  features: string[], 
  buttonText: string, 
  buttonLink: string, 
  popular: boolean 
}) {
  return (
    <Card className={`relative flex flex-col h-full ${popular ? 'border-primary shadow-lg' : ''}`}>
      {popular && (
        <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-medium py-1 px-3 rounded-bl-lg rounded-tr-lg">
          Más Popular
        </div>
      )}
      <CardContent className="pt-6 flex-1 flex flex-col">
        <div className="mb-6">
          <h3 className="text-xl font-bold mb-2">{title}</h3>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-3xl font-bold">{price}</span>
            {period && <span className="text-muted-foreground pb-1">{period}</span>}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        
        <ul className="space-y-2 mb-6 flex-1">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="mt-1 bg-primary/10 text-primary rounded-full p-0.5">
                <Check className="h-3 w-3" />
              </span>
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
        
        <Link to={buttonLink}>
          <Button 
            className="w-full" 
            variant={popular ? "default" : "outline"}
          >
            {buttonText}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// Component for benefit items
function BenefitItem({ title, description }: { title: string, description: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="mt-1 p-1 rounded-full bg-primary/10 text-primary">
          <Check className="h-4 w-4" />
        </div>
        <h3 className="font-medium text-xl">{title}</h3>
      </div>
      <p className="text-muted-foreground pl-8">{description}</p>
    </div>
  );
}

// Component for footer links
function FooterLink({ href, children }: { href: string, children: React.ReactNode }) {
  return (
    <li>
      <a 
        href={href} 
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {children}
      </a>
    </li>
  );
}

function Check(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}