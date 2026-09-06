import { useState } from "react";
import { useListRfidCards, useCreateRfidCard, useUpdateRfidCard, useDeleteRfidCard, useListVehicles, getListRfidCardsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CreditCard, Plus, Edit2, Trash2, Shield, ShieldAlert, Link as LinkIcon, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

const cardSchema = z.object({
  cardUid: z.string().min(1, "UID is required"),
  vehicleId: z.coerce.number().nullable().optional(),
  active: z.boolean().default(true),
});

type CardFormValues = z.infer<typeof cardSchema>;

export default function RfidCards() {
  const queryClient = useQueryClient();
  const { data: cards, isLoading } = useListRfidCards();
  const { data: vehicles } = useListVehicles({});
  
  const createCard = useCreateRfidCard();
  const updateCard = useUpdateRfidCard();
  const deleteCard = useDeleteRfidCard();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any>(null);

  const form = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: { cardUid: "", vehicleId: null, active: true },
  });

  const editForm = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
  });

  const handleCreate = (data: CardFormValues) => {
    createCard.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRfidCardsQueryKey() });
        setIsCreateOpen(false);
        form.reset();
        toast.success("Card provisioned successfully");
      },
      onError: () => toast.error("Failed to provision card")
    });
  };

  const handleUpdate = (data: CardFormValues) => {
    if (!editingCard) return;
    updateCard.mutate({ id: editingCard.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRfidCardsQueryKey() });
        setEditingCard(null);
        toast.success("Card updated successfully");
      },
      onError: () => toast.error("Failed to update card")
    });
  };

  const handleDelete = (id: number) => {
    deleteCard.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRfidCardsQueryKey() });
        toast.success("Card deleted successfully");
      },
      onError: () => toast.error("Failed to delete card")
    });
  };

  const toggleActive = (card: any, checked: boolean) => {
    updateCard.mutate({ id: card.id, data: { active: checked } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRfidCardsQueryKey() });
        toast.success(`Card ${checked ? 'activated' : 'deactivated'}`);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono" data-testid="button-create-card">
              <Plus className="mr-2 h-4 w-4" /> PROVISION CARD
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-mono">PROVISION RFID TAG</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                <FormField control={form.control} name="cardUid" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">TAG UID (HEX)</FormLabel>
                    <FormControl><Input {...field} className="font-mono uppercase" placeholder="A1B2C3D4" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="vehicleId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">ASSIGN TO VEHICLE</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val === "unassigned" ? null : parseInt(val))} 
                      value={field.value?.toString() || "unassigned"}
                    >
                      <FormControl>
                        <SelectTrigger className="font-mono">
                          <SelectValue placeholder="Select vehicle" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned" className="text-muted-foreground italic">UNASSIGNED</SelectItem>
                        {vehicles?.map(v => (
                          <SelectItem key={v.id} value={v.id.toString()}>
                            {v.plateNumber} ({v.ownerName})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="active" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="font-mono text-xs">ACTIVE STATUS</FormLabel>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="submit" disabled={createCard.isPending} className="font-mono">
                    {createCard.isPending ? "PROVISIONING..." : "PROVISION"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border bg-card/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="font-mono uppercase tracking-wider text-sm text-muted-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Tag Registry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs">STATUS</TableHead>
                <TableHead className="font-mono text-xs">TAG UID</TableHead>
                <TableHead className="font-mono text-xs">ASSIGNMENT</TableHead>
                <TableHead className="font-mono text-xs">ISSUED</TableHead>
                <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : cards?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center font-mono text-sm text-muted-foreground py-8">
                    NO TAGS PROVISIONED
                  </TableCell>
                </TableRow>
              ) : (
                cards?.map(card => (
                  <TableRow key={card.id} className="border-border" data-testid={`row-card-${card.id}`}>
                    <TableCell>
                      <Switch 
                        checked={card.active} 
                        onCheckedChange={(v) => toggleActive(card, v)}
                        className="data-[state=checked]:bg-success"
                        aria-label="Toggle active status"
                      />
                    </TableCell>
                    <TableCell className="font-mono tracking-widest text-sm">{card.cardUid}</TableCell>
                    <TableCell>
                      {card.vehicleId ? (
                        <div className="flex items-center gap-2">
                          <LinkIcon className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono font-medium text-primary">{(card as any).vehiclePlate || 'Unknown'}</span>
                          <span className="font-mono text-xs text-muted-foreground">({(card as any).ownerName || 'Unknown'})</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="border-dashed text-muted-foreground bg-transparent font-mono gap-1 text-[10px]">
                          <Unlink className="h-3 w-3" /> UNASSIGNED
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {format(new Date(card.issuedAt), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Dialog open={editingCard?.id === card.id} onOpenChange={(open) => {
                        if (open) {
                          setEditingCard(card);
                          editForm.reset({ cardUid: card.cardUid, vehicleId: card.vehicleId, active: card.active });
                        } else {
                          setEditingCard(null);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="border-border bg-card">
                          <DialogHeader>
                            <DialogTitle className="font-mono">EDIT TAG {card.cardUid}</DialogTitle>
                          </DialogHeader>
                          <Form {...editForm}>
                            <form onSubmit={editForm.handleSubmit(handleUpdate)} className="space-y-4">
                              <FormField control={editForm.control} name="cardUid" render={({ field }) => (
                                <FormItem><FormLabel className="font-mono text-xs">TAG UID (HEX)</FormLabel><FormControl><Input {...field} className="font-mono uppercase" /></FormControl></FormItem>
                              )} />
                              <FormField control={editForm.control} name="vehicleId" render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="font-mono text-xs">ASSIGN TO VEHICLE</FormLabel>
                                  <Select 
                                    onValueChange={(val) => field.onChange(val === "unassigned" ? null : parseInt(val))} 
                                    value={field.value?.toString() || "unassigned"}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="unassigned" className="text-muted-foreground italic">UNASSIGNED</SelectItem>
                                      {vehicles?.map(v => (
                                        <SelectItem key={v.id} value={v.id.toString()}>{v.plateNumber} ({v.ownerName})</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )} />
                              <DialogFooter>
                                <Button type="submit" disabled={updateCard.isPending} className="font-mono">UPDATE</Button>
                              </DialogFooter>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="border-border bg-card">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-mono">DESTROY TAG RECORD?</AlertDialogTitle>
                            <AlertDialogDescription className="font-mono text-sm text-muted-foreground">
                              This permanently deletes the card. The hardware will reject scans for this UID immediately.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(card.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono">
                              DESTROY
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
