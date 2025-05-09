import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

import {
  CheckCircle2,
  AlertTriangle,
  Shield,
  Clock,
  Play,
  Globe,
  Mail,
  Search,
  ShieldAlert,
  Lock,
  Code,
  Users,
  Edit,
  Plus,
  Trash,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Check,
  Sparkles,
  Rocket,
  Wand2,
  Zap,
} from "lucide-react";

// Definición de tipos
interface PlaybookAction {
  id: string;
  type: string;
  name: string;
  description: string;
  configuration: Record<string, any>;
  order: number;
}

// Esquema para validación del asistente
const wizardBasicInfoSchema = z.object({
  name: z.string().min(3, { message: "El nombre debe tener al menos 3 caracteres" }),
  description: z.string().min(10, { message: "La descripción debe tener al menos 10 caracteres" }),
  category: z.enum(["incident-response", "threat-hunting", "vulnerability-management", "compliance", "general"]),
  isAutomated: z.boolean().default(false),
});

const wizardTriggerSchema = z.object({
  triggerType: z.enum(["alert", "incident", "schedule", "manual", "threat-intel"]),
  triggerConfig: z.record(z.any()).optional(),
});

const wizardActionSchema = z.object({
  actionType: z.string().min(1, { message: "Debe seleccionar un tipo de acción" }),
  actionName: z.string().min(3, { message: "El nombre debe tener al menos 3 caracteres" }),
  actionDescription: z.string().min(5, { message: "La descripción debe tener al menos 5 caracteres" }),
  actionConfig: z.record(z.any()).optional(),
});

// Datos de referencia
const triggerTypes = [
  { value: "alert", label: "Alerta", icon: AlertTriangle, description: "Se activa cuando se detecta una alerta específica" },
  { value: "incident", label: "Incidente", icon: Shield, description: "Se activa cuando se crea o actualiza un incidente" },
  { value: "schedule", label: "Programada", icon: Clock, description: "Se ejecuta según un horario definido" },
  { value: "manual", label: "Manual", icon: Play, description: "Se ejecuta manualmente por un usuario" },
  { value: "threat-intel", label: "Inteligencia de Amenazas", icon: Globe, description: "Se activa con nueva inteligencia de amenazas" },
];

const actionTypes = [
  { value: "notify", label: "Enviar Notificación", icon: Mail, description: "Envía notificaciones por email, Slack u otros canales" },
  { value: "enrich", label: "Enriquecer Datos", icon: Search, description: "Enriquece los datos del incidente con información adicional" },
  { value: "block", label: "Bloquear Entidad", icon: Shield, description: "Bloquea IPs, dominios u otras entidades maliciosas" },
  { value: "scan", label: "Ejecutar Escaneo", icon: Search, description: "Realiza un escaneo de seguridad sobre los sistemas afectados" },
  { value: "investigate", label: "Investigar", icon: ShieldAlert, description: "Realiza investigaciones automáticas sobre la amenaza" },
  { value: "containment", label: "Contención", icon: Lock, description: "Ejecuta acciones de contención para aislar la amenaza" },
  { value: "api-call", label: "Llamada API", icon: Globe, description: "Realiza llamadas a APIs externas" },
  { value: "script", label: "Ejecutar Script", icon: Code, description: "Ejecuta scripts o comandos personalizados" },
  { value: "update-ticket", label: "Actualizar Ticket", icon: Edit, description: "Actualiza tickets en sistemas de gestión" },
  { value: "escalate", label: "Escalar", icon: Users, description: "Escala el incidente a equipos o personas específicas" },
];

const categoryOptions = [
  { value: "incident-response", label: "Respuesta a Incidentes" },
  { value: "threat-hunting", label: "Búsqueda de Amenazas" },
  { value: "vulnerability-management", label: "Gestión de Vulnerabilidades" },
  { value: "compliance", label: "Cumplimiento Normativo" },
  { value: "general", label: "General" },
];

interface PlaybookWizardProps {
  isOpen: boolean;
  onClose: () => void;
  editingPlaybook?: any;
}

export default function PlaybookWizard({ isOpen, onClose, editingPlaybook }: PlaybookWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [actions, setActions] = useState<PlaybookAction[]>([]);
  const [currentAction, setCurrentAction] = useState<PlaybookAction | null>(null);
  const [wizardComplete, setWizardComplete] = useState(false);
  
  // Animaciones
  const fadeInVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
  };
  
  // Form para datos básicos
  const basicInfoForm = useForm<z.infer<typeof wizardBasicInfoSchema>>({
    resolver: zodResolver(wizardBasicInfoSchema),
    defaultValues: {
      name: editingPlaybook?.name || "",
      description: editingPlaybook?.description || "",
      category: editingPlaybook?.category || "general",
      isAutomated: editingPlaybook?.isAutomated || false,
    },
  });
  
  // Form para configuración del disparador
  const triggerForm = useForm<z.infer<typeof wizardTriggerSchema>>({
    resolver: zodResolver(wizardTriggerSchema),
    defaultValues: {
      triggerType: editingPlaybook?.trigger?.type || "manual",
      triggerConfig: editingPlaybook?.trigger?.configuration || {},
    },
  });
  
  // Form para acciones
  const actionForm = useForm<z.infer<typeof wizardActionSchema>>({
    resolver: zodResolver(wizardActionSchema),
    defaultValues: {
      actionType: "",
      actionName: "",
      actionDescription: "",
      actionConfig: {},
    },
  });
  
  // Cargar acciones si estamos editando
  useEffect(() => {
    if (editingPlaybook && editingPlaybook.actions) {
      setActions([...editingPlaybook.actions]);
    }
  }, [editingPlaybook]);
  
  // Mutación para crear playbook
  const createPlaybookMutation = useMutation({
    mutationFn: async (playbookData: any) => {
      const res = await apiRequest('POST', '/api/playbooks', playbookData);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/playbooks'] });
      
      toast({
        title: "Playbook creado",
        description: `El playbook "${data.name}" ha sido creado exitosamente`,
      });
      
      resetWizard();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error al crear el playbook",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Mutación para actualizar playbook
  const updatePlaybookMutation = useMutation({
    mutationFn: async ({ id, playbookData }: { id: number | string, playbookData: any }) => {
      const res = await apiRequest('PATCH', `/api/playbooks/${id}`, playbookData);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/playbooks'] });
      
      toast({
        title: "Playbook actualizado",
        description: `El playbook "${data.name}" ha sido actualizado exitosamente`,
      });
      
      resetWizard();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error al actualizar el playbook",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Obtener el progreso del asistente
  const progress = useMemo(() => {
    const totalSteps = 4; // Información básica, disparador, acciones, revisión
    return (step / totalSteps) * 100;
  }, [step]);
  
  // Navegación entre pasos
  const nextStep = () => {
    if (step === 1) {
      basicInfoForm.handleSubmit(
        () => setStep(step + 1),
        (errors) => {
          console.error("Validation errors:", errors);
          toast({
            title: "Por favor corrija los errores",
            description: "Hay errores en el formulario que deben ser corregidos",
            variant: "destructive",
          });
        }
      )();
    } 
    else if (step === 2) {
      triggerForm.handleSubmit(
        () => setStep(step + 1),
        (errors) => {
          console.error("Validation errors:", errors);
          toast({
            title: "Por favor corrija los errores",
            description: "Hay errores en el formulario que deben ser corregidos",
            variant: "destructive",
          });
        }
      )();
    }
    else if (step === 3) {
      if (actions.length === 0) {
        toast({
          title: "Se requiere al menos una acción",
          description: "Debe agregar al menos una acción al playbook",
          variant: "destructive",
        });
        return;
      }
      setStep(step + 1);
    }
    else if (step === 4) {
      handleSubmitPlaybook();
    }
  };
  
  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };
  
  // Agregar nueva acción
  const handleAddAction = () => {
    actionForm.handleSubmit((values) => {
      const newAction: PlaybookAction = {
        id: `action-${Date.now()}`,
        type: values.actionType,
        name: values.actionName,
        description: values.actionDescription,
        configuration: values.actionConfig || {},
        order: actions.length + 1,
      };
      
      setActions([...actions, newAction]);
      actionForm.reset({
        actionType: "",
        actionName: "",
        actionDescription: "",
        actionConfig: {},
      });
      setCurrentAction(null);
      
      toast({
        title: "Acción agregada",
        description: `La acción "${values.actionName}" ha sido agregada al playbook`,
      });
      
    }, (errors) => {
      console.error("Validation errors:", errors);
      toast({
        title: "Por favor corrija los errores",
        description: "Hay errores en el formulario de la acción",
        variant: "destructive",
      });
    })();
  };
  
  // Editar acción
  const handleEditAction = (action: PlaybookAction) => {
    setCurrentAction(action);
    actionForm.reset({
      actionType: action.type,
      actionName: action.name,
      actionDescription: action.description,
      actionConfig: action.configuration,
    });
  };
  
  // Actualizar acción existente
  const handleUpdateAction = () => {
    if (!currentAction) return;
    
    actionForm.handleSubmit((values) => {
      const updatedActions = actions.map(action => {
        if (action.id === currentAction.id) {
          return {
            ...action,
            type: values.actionType,
            name: values.actionName,
            description: values.actionDescription,
            configuration: values.actionConfig || {},
          };
        }
        return action;
      });
      
      setActions(updatedActions);
      actionForm.reset({
        actionType: "",
        actionName: "",
        actionDescription: "",
        actionConfig: {},
      });
      setCurrentAction(null);
      
      toast({
        title: "Acción actualizada",
        description: `La acción "${values.actionName}" ha sido actualizada`,
      });
      
    }, (errors) => {
      console.error("Validation errors:", errors);
      toast({
        title: "Por favor corrija los errores",
        description: "Hay errores en el formulario de la acción",
        variant: "destructive",
      });
    })();
  };
  
  // Eliminar acción
  const handleDeleteAction = (actionId: string) => {
    const updatedActions = actions.filter(action => action.id !== actionId);
    // Actualizar el orden
    const reorderedActions = updatedActions.map((action, index) => ({
      ...action,
      order: index + 1,
    }));
    
    setActions(reorderedActions);
    
    if (currentAction && currentAction.id === actionId) {
      setCurrentAction(null);
      actionForm.reset({
        actionType: "",
        actionName: "",
        actionDescription: "",
        actionConfig: {},
      });
    }
    
    toast({
      title: "Acción eliminada",
      description: "La acción ha sido eliminada del playbook",
    });
  };
  
  // Mover acción (arriba/abajo)
  const handleMoveAction = (actionId: string, direction: 'up' | 'down') => {
    const actionIndex = actions.findIndex(action => action.id === actionId);
    if (actionIndex === -1) return;
    
    const newActions = [...actions];
    
    if (direction === 'up' && actionIndex > 0) {
      // Intercambiar con la acción anterior
      [newActions[actionIndex - 1], newActions[actionIndex]] = 
      [newActions[actionIndex], newActions[actionIndex - 1]];
    } else if (direction === 'down' && actionIndex < actions.length - 1) {
      // Intercambiar con la acción siguiente
      [newActions[actionIndex], newActions[actionIndex + 1]] = 
      [newActions[actionIndex + 1], newActions[actionIndex]];
    }
    
    // Actualizar el orden
    const reorderedActions = newActions.map((action, index) => ({
      ...action,
      order: index + 1,
    }));
    
    setActions(reorderedActions);
  };
  
  // Enviar el playbook (crear/actualizar)
  const handleSubmitPlaybook = () => {
    const basicInfo = basicInfoForm.getValues();
    const triggerInfo = triggerForm.getValues();
    
    // Preparar los datos para la API
    const playbookData = {
      name: basicInfo.name,
      description: basicInfo.description,
      category: basicInfo.category,
      isActive: basicInfo.isAutomated,
      triggerType: triggerInfo.triggerType,
      triggerCondition: triggerInfo.triggerConfig,
      steps: JSON.stringify(actions),
      tags: JSON.stringify([]), // Para futuras mejoras
    };
    
    if (editingPlaybook) {
      updatePlaybookMutation.mutate({
        id: editingPlaybook.id,
        playbookData
      });
    } else {
      createPlaybookMutation.mutate(playbookData);
    }
    
    setWizardComplete(true);
  };
  
  // Reiniciar el asistente
  const resetWizard = () => {
    setStep(1);
    setActions([]);
    setCurrentAction(null);
    setWizardComplete(false);
    basicInfoForm.reset({
      name: "",
      description: "",
      category: "general",
      isAutomated: false,
    });
    triggerForm.reset({
      triggerType: "manual",
      triggerConfig: {},
    });
    actionForm.reset({
      actionType: "",
      actionName: "",
      actionDescription: "",
      actionConfig: {},
    });
  };
  
  // Renderizar el icono del trigger
  const getTriggerIcon = (type: string) => {
    const trigger = triggerTypes.find(t => t.value === type);
    if (!trigger) return <AlertTriangle className="h-5 w-5" />;
    
    const Icon = trigger.icon;
    return <Icon className="h-5 w-5" />;
  };
  
  // Renderizar el icono de la acción
  const getActionIcon = (type: string) => {
    const action = actionTypes.find(a => a.value === type);
    if (!action) return <Zap className="h-5 w-5" />;
    
    const Icon = action.icon;
    return <Icon className="h-5 w-5" />;
  };
  
  // Obtener la descripción del trigger
  const getTriggerDescription = (type: string) => {
    const trigger = triggerTypes.find(t => t.value === type);
    return trigger?.description || "Disparador personalizado";
  };
  
  // Cerrar el asistente
  const handleClose = () => {
    resetWizard();
    onClose();
  };
  
  // Obtener la etiqueta de una categoría
  const getCategoryLabel = (category: string): string => {
    const option = categoryOptions.find(opt => opt.value === category);
    return option?.label || "General";
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Wand2 className="h-6 w-6 text-primary" />
            {editingPlaybook ? "Editar Playbook" : "Asistente de Creación de Playbook"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Ingrese la información básica del playbook"}
            {step === 2 && "Configure el disparador que activará este playbook"}
            {step === 3 && "Agregue las acciones que ejecutará el playbook"}
            {step === 4 && "Revise la configuración del playbook antes de guardarlo"}
          </DialogDescription>
        </DialogHeader>
        
        {/* Barra de progreso */}
        <div className="w-full bg-secondary h-2 rounded-full mb-6 overflow-hidden">
          <motion.div 
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        
        {/* Pasos del asistente */}
        <AnimatePresence mode="wait">
          {/* Paso 1: Información básica */}
          {step === 1 && (
            <motion.div
              key="step1"
              variants={fadeInVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              <Form {...basicInfoForm}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <FormField
                      control={basicInfoForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre del Playbook</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: Respuesta a Malware" {...field} />
                          </FormControl>
                          <FormDescription>
                            Un nombre descriptivo y único para este playbook
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={basicInfoForm.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Categoría</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccione una categoría" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categoryOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            La categoría ayuda a organizar los playbooks por su propósito
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={basicInfoForm.control}
                      name="isAutomated"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Ejecución Automatizada
                            </FormLabel>
                            <FormDescription>
                              Cuando está activado, el playbook se ejecutará automáticamente cuando se cumpla su condición de disparo
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div>
                    <FormField
                      control={basicInfoForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describa el propósito y funcionamiento de este playbook"
                              className="h-40 resize-none"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Explique qué hace este playbook, cuándo debería utilizarse y cualquier otra información relevante
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="mt-6 p-4 bg-muted rounded-lg">
                      <h4 className="font-medium mb-2 flex items-center">
                        <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
                        Consejo
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Un buen playbook tiene un propósito claro y específico. Considere nombrar su playbook según su función principal, como "Respuesta a Phishing" o "Verificación de Vulnerabilidades Críticas".
                      </p>
                    </div>
                  </div>
                </div>
              </Form>
            </motion.div>
          )}
          
          {/* Paso 2: Configuración del disparador */}
          {step === 2 && (
            <motion.div
              key="step2"
              variants={fadeInVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              <Form {...triggerForm}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <FormField
                      control={triggerForm.control}
                      name="triggerType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Disparador</FormLabel>
                          <FormControl>
                            <div className="space-y-4">
                              {triggerTypes.map(trigger => (
                                <div
                                  key={trigger.value}
                                  className={`flex items-start space-x-3 border rounded-lg p-3 cursor-pointer transition-colors ${
                                    field.value === trigger.value
                                      ? "border-primary bg-primary/5"
                                      : "hover:border-muted-foreground/20"
                                  }`}
                                  onClick={() => field.onChange(trigger.value)}
                                >
                                  <div className={`rounded-full p-2 ${
                                    field.value === trigger.value
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted"
                                  }`}>
                                    <trigger.icon className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <Label className="font-medium cursor-pointer">
                                        {trigger.label}
                                      </Label>
                                      {field.value === trigger.value && (
                                        <Badge variant="outline" className="bg-primary/10">
                                          Seleccionado
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {trigger.description}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div>
                    {/* Configuración específica según el tipo de disparador */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={triggerForm.watch("triggerType")}
                        variants={fadeInVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-4"
                      >
                        <h3 className="text-lg font-medium">Configuración del Disparador</h3>
                        
                        {triggerForm.watch("triggerType") === "alert" && (
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Configure qué tipos de alertas activarán este playbook.
                            </p>
                            
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Severidad Mínima</Label>
                                  <Select
                                    defaultValue="high"
                                    onValueChange={(value) => {
                                      const current = triggerForm.getValues("triggerConfig") || {};
                                      triggerForm.setValue("triggerConfig", {
                                        ...current,
                                        minSeverity: value
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccione severidad" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="critical">Crítica</SelectItem>
                                      <SelectItem value="high">Alta</SelectItem>
                                      <SelectItem value="medium">Media</SelectItem>
                                      <SelectItem value="low">Baja</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Tipo de Alerta</Label>
                                  <Select
                                    defaultValue="any"
                                    onValueChange={(value) => {
                                      const current = triggerForm.getValues("triggerConfig") || {};
                                      triggerForm.setValue("triggerConfig", {
                                        ...current,
                                        alertType: value
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccione tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="any">Cualquiera</SelectItem>
                                      <SelectItem value="malware">Malware</SelectItem>
                                      <SelectItem value="intrusion">Intrusión</SelectItem>
                                      <SelectItem value="anomaly">Anomalía</SelectItem>
                                      <SelectItem value="network">Red</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {triggerForm.watch("triggerType") === "incident" && (
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Configure qué tipos de incidentes activarán este playbook.
                            </p>
                            
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Severidad Mínima</Label>
                                  <Select
                                    defaultValue="high"
                                    onValueChange={(value) => {
                                      const current = triggerForm.getValues("triggerConfig") || {};
                                      triggerForm.setValue("triggerConfig", {
                                        ...current,
                                        minSeverity: value
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccione severidad" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="critical">Crítica</SelectItem>
                                      <SelectItem value="high">Alta</SelectItem>
                                      <SelectItem value="medium">Media</SelectItem>
                                      <SelectItem value="low">Baja</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Estado</Label>
                                  <Select
                                    defaultValue="new"
                                    onValueChange={(value) => {
                                      const current = triggerForm.getValues("triggerConfig") || {};
                                      triggerForm.setValue("triggerConfig", {
                                        ...current,
                                        status: value
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccione estado" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="new">Nuevo</SelectItem>
                                      <SelectItem value="any">Cualquiera</SelectItem>
                                      <SelectItem value="in_progress">En Progreso</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {triggerForm.watch("triggerType") === "schedule" && (
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Configure cuándo se ejecutará este playbook automáticamente.
                            </p>
                            
                            <div className="space-y-4">
                              <div className="grid gap-4">
                                <div className="space-y-2">
                                  <Label>Frecuencia</Label>
                                  <Select
                                    defaultValue="daily"
                                    onValueChange={(value) => {
                                      const current = triggerForm.getValues("triggerConfig") || {};
                                      let schedule = "0 0 * * *"; // diario a medianoche por defecto
                                      
                                      switch (value) {
                                        case "hourly": schedule = "0 * * * *"; break;
                                        case "daily": schedule = "0 0 * * *"; break;
                                        case "weekly": schedule = "0 0 * * 0"; break;
                                        case "monthly": schedule = "0 0 1 * *"; break;
                                      }
                                      
                                      triggerForm.setValue("triggerConfig", {
                                        ...current,
                                        frequency: value,
                                        schedule: schedule
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccione frecuencia" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="hourly">Cada hora</SelectItem>
                                      <SelectItem value="daily">Diario</SelectItem>
                                      <SelectItem value="weekly">Semanal</SelectItem>
                                      <SelectItem value="monthly">Mensual</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Expresión Cron (avanzado)</Label>
                                  <Input 
                                    placeholder="0 0 * * *" 
                                    onChange={(e) => {
                                      const current = triggerForm.getValues("triggerConfig") || {};
                                      triggerForm.setValue("triggerConfig", {
                                        ...current,
                                        schedule: e.target.value
                                      });
                                    }}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Formato: minuto hora día-del-mes mes día-de-la-semana
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {triggerForm.watch("triggerType") === "manual" && (
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Este playbook se ejecutará manualmente cuando un usuario lo active.
                            </p>
                            
                            <Alert>
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription>
                                Los playbooks manuales no requieren configuración adicional y se pueden ejecutar desde la interfaz de SOAR en cualquier momento.
                              </AlertDescription>
                            </Alert>
                          </div>
                        )}
                        
                        {triggerForm.watch("triggerType") === "threat-intel" && (
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Configure qué tipos de inteligencia de amenazas activarán este playbook.
                            </p>
                            
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Confianza Mínima (%)</Label>
                                  <Input 
                                    type="number"
                                    min="0"
                                    max="100"
                                    defaultValue="75"
                                    onChange={(e) => {
                                      const current = triggerForm.getValues("triggerConfig") || {};
                                      triggerForm.setValue("triggerConfig", {
                                        ...current,
                                        minConfidence: parseInt(e.target.value)
                                      });
                                    }}
                                  />
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Tipo de Inteligencia</Label>
                                  <Select
                                    defaultValue="any"
                                    onValueChange={(value) => {
                                      const current = triggerForm.getValues("triggerConfig") || {};
                                      triggerForm.setValue("triggerConfig", {
                                        ...current,
                                        intelType: value
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccione tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="any">Cualquiera</SelectItem>
                                      <SelectItem value="ioc">Indicadores de Compromiso</SelectItem>
                                      <SelectItem value="vulnerability">Vulnerabilidades</SelectItem>
                                      <SelectItem value="threat-actor">Actores de Amenaza</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </Form>
            </motion.div>
          )}
          
          {/* Paso 3: Agregar acciones */}
          {step === 3 && (
            <motion.div
              key="step3"
              variants={fadeInVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lista de acciones actuales */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Acciones del Playbook</h3>
                  
                  {actions.length === 0 ? (
                    <div className="border border-dashed rounded-lg py-8 px-4 text-center">
                      <div className="flex justify-center mb-2">
                        <Zap className="h-8 w-8 text-muted-foreground/70" />
                      </div>
                      <h4 className="text-sm font-medium">No hay acciones</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Agregue acciones a ejecutar cuando se active este playbook
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {actions.map((action, index) => (
                        <Card
                          key={action.id}
                          className={`overflow-hidden ${
                            currentAction?.id === action.id
                              ? "ring-2 ring-primary"
                              : ""
                          }`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start space-x-3">
                                <div className="rounded-full bg-primary/10 p-2 mt-1">
                                  <div className="flex items-center justify-center bg-primary text-primary-foreground h-4 w-4 rounded-full text-[10px]">
                                    {index + 1}
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center space-x-2">
                                    {getActionIcon(action.type)}
                                    <h4 className="font-medium">{action.name}</h4>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {action.description}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex space-x-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleMoveAction(action.id, 'up')}
                                  disabled={index === 0}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleMoveAction(action.id, 'down')}
                                  disabled={index === actions.length - 1}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleEditAction(action)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => handleDeleteAction(action.id)}
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Formulario para agregar/editar acciones */}
                <div>
                  <h3 className="text-lg font-medium mb-4">
                    {currentAction ? "Editar Acción" : "Agregar Nueva Acción"}
                  </h3>
                  
                  <Form {...actionForm}>
                    <div className="space-y-4">
                      <FormField
                        control={actionForm.control}
                        name="actionType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Acción</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccione un tipo de acción" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {actionTypes.map(action => (
                                  <SelectItem key={action.value} value={action.value}>
                                    <div className="flex items-center">
                                      <action.icon className="h-4 w-4 mr-2" />
                                      {action.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={actionForm.control}
                        name="actionName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre de la Acción</FormLabel>
                            <FormControl>
                              <Input placeholder="Ej: Notificar al Equipo de Seguridad" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={actionForm.control}
                        name="actionDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Descripción</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Describa lo que hace esta acción"
                                className="h-20 resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Configuración específica según el tipo de acción */}
                      {actionForm.watch("actionType") && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ duration: 0.3 }}
                          className="space-y-4 overflow-hidden"
                        >
                          <Separator />
                          
                          <h4 className="font-medium">Configuración de la Acción</h4>
                          
                          {actionForm.watch("actionType") === "notify" && (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Canal de Notificación</Label>
                                  <Select
                                    defaultValue="email"
                                    onValueChange={(value) => {
                                      const current = actionForm.getValues("actionConfig") || {};
                                      actionForm.setValue("actionConfig", {
                                        ...current,
                                        channel: value
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccione canal" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="email">Email</SelectItem>
                                      <SelectItem value="slack">Slack</SelectItem>
                                      <SelectItem value="teams">Microsoft Teams</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Destinatarios</Label>
                                  <Input 
                                    placeholder="security@example.com" 
                                    onChange={(e) => {
                                      const current = actionForm.getValues("actionConfig") || {};
                                      actionForm.setValue("actionConfig", {
                                        ...current,
                                        recipients: e.target.value.split(',').map(r => r.trim())
                                      });
                                    }}
                                  />
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Plantilla</Label>
                                <Input 
                                  placeholder="Nombre de la plantilla" 
                                  onChange={(e) => {
                                    const current = actionForm.getValues("actionConfig") || {};
                                    actionForm.setValue("actionConfig", {
                                      ...current,
                                      template: e.target.value
                                    });
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          
                          {/* Aquí puedes agregar más configuraciones específicas para otros tipos de acciones */}
                        </motion.div>
                      )}
                      
                      <div className="flex justify-end space-x-2 pt-2">
                        {currentAction && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setCurrentAction(null);
                              actionForm.reset({
                                actionType: "",
                                actionName: "",
                                actionDescription: "",
                                actionConfig: {},
                              });
                            }}
                          >
                            Cancelar
                          </Button>
                        )}
                        
                        <Button
                          onClick={currentAction ? handleUpdateAction : handleAddAction}
                          disabled={
                            !actionForm.watch("actionType") ||
                            !actionForm.watch("actionName") ||
                            !actionForm.watch("actionDescription")
                          }
                        >
                          {currentAction ? "Actualizar Acción" : "Agregar Acción"}
                        </Button>
                      </div>
                    </div>
                  </Form>
                </div>
              </div>
            </motion.div>
          )}
          
          {/* Paso 4: Revisión */}
          {step === 4 && (
            <motion.div
              key="step4"
              variants={fadeInVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Información General</h3>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Nombre</p>
                          <p className="font-medium">{basicInfoForm.getValues("name")}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-muted-foreground">Categoría</p>
                          <p className="font-medium">{getCategoryLabel(basicInfoForm.getValues("category"))}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-muted-foreground">Ejecución</p>
                          <p className="font-medium">
                            {basicInfoForm.getValues("isAutomated") ? "Automatizada" : "Manual"}
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-muted-foreground">Disparador</p>
                          <div className="flex items-center space-x-2">
                            {getTriggerIcon(triggerForm.getValues("triggerType"))}
                            <p className="font-medium">
                              {triggerTypes.find(t => t.value === triggerForm.getValues("triggerType"))?.label || "Desconocido"}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {getTriggerDescription(triggerForm.getValues("triggerType"))}
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-muted-foreground">Descripción</p>
                          <p className="text-sm">
                            {basicInfoForm.getValues("description")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-4">Secuencia de Acciones ({actions.length})</h3>
                  
                  {actions.length === 0 ? (
                    <Card>
                      <CardContent className="p-6 text-center">
                        <div className="flex justify-center mb-2">
                          <AlertTriangle className="h-8 w-8 text-amber-500" />
                        </div>
                        <h4 className="font-medium">No hay acciones configuradas</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Este playbook no tendrá ninguna acción. Considere volver atrás y agregar al menos una.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="p-0">
                        <div className="relative">
                          {actions.map((action, index) => (
                            <div key={action.id} className="border-b last:border-b-0">
                              <div className="p-4 relative">
                                <div className="flex items-start space-x-3">
                                  <div className="flex flex-col items-center">
                                    <div className="flex items-center justify-center bg-primary text-primary-foreground rounded-full h-6 w-6 text-xs">
                                      {index + 1}
                                    </div>
                                    {index < actions.length - 1 && (
                                      <div className="h-8 w-px bg-border mx-auto mt-1"></div>
                                    )}
                                  </div>
                                  
                                  <div className="flex-1">
                                    <div className="flex items-center">
                                      {getActionIcon(action.type)}
                                      <h4 className="font-medium ml-2">{action.name}</h4>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {action.description}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  <div className="mt-6">
                    <Alert>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertDescription>
                        El playbook está listo para ser guardado. Una vez guardado, podrá ser ejecutado manualmente o automáticamente según su configuración.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          
          {/* Animación de completado */}
          {wizardComplete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-10"
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{ repeat: 0, duration: 0.6 }}
                className="inline-flex items-center justify-center rounded-full bg-green-100 p-4 mb-4"
              >
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </motion.div>
              
              <h3 className="text-2xl font-bold">¡Playbook Guardado!</h3>
              <p className="text-muted-foreground mt-2 mb-6">
                El playbook ha sido guardado exitosamente y está listo para ser utilizado.
              </p>
              
              <Button onClick={handleClose}>
                Cerrar
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Botones de navegación */}
        {!wizardComplete && (
          <DialogFooter className="mt-6 space-x-2">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={prevStep}
              >
                <ChevronLeft className="mr-2 h-4 w-4" /> Anterior
              </Button>
            )}
            
            <Button
              onClick={nextStep}
            >
              {step < 4 ? (
                <>
                  Siguiente <ChevronRight className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  {editingPlaybook ? "Actualizar Playbook" : "Crear Playbook"} <Rocket className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}