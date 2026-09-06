import { useState } from "react";
import { useListVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle, getListVehiclesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Car, Plus, Edit2, Trash2, Search, Activity, ShieldBan } from "lucide-react";
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

const vehicleSchema = z.object({
  plateNumber: z.string().min(1, "Plate is required"),
  ownerName: z.string().min(1, "Owner is required"),
  vehicleType: z.enum(["car", "bike", "truck", "bus", "other"]),
  status: z.enum(["active", "inactive"]),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

export default function Vehicles() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: vehicles, isLoading } = useListVehicles({ search: search || undefined });
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { plateNumber: "", ownerName: "", vehicleType: "car", status: "active" },
  });

  const editForm = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
  });

  const handleCreate = (data: VehicleFormValues) => {
    createVehicle.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        setIsCreateOpen(false);
        form.reset();
        toast.success("Vehicle registered successfully");
      },
      onError: () => toast.error("Failed to register vehicle")
    });
  };

  const handleUpdate = (data: VehicleFormValues) => {
    if (!editingVehicle) return;
    updateVehicle.mutate({ id: editingVehicle.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        setEditingVehicle(null);
        toast.success("Vehicle updated successfully");
      },
      onError: () => toast.error("Failed to update vehicle")
    });
  };

  const handleDelete = (id: number) => {
    deleteVehicle.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        toast.success("Vehicle removed successfully");
      },
      onError: () => toast.error("Failed to remove vehicle")
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search plate or owner..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 font-mono text-sm bg-card/50"
            data-testid="input-search-vehicles"
          />
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono" data-testid="button-create-vehicle">
              <Plus className="mr-2 h-4 w-4" /> REGISTER VEHICLE
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-mono">NEW VEHICLE RECORD</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                <FormField control={form.control} name="plateNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">PLATE NUMBER</FormLabel>
                    <FormControl><Input {...field} className="font-mono uppercase" placeholder="ABC-1234" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="ownerName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">OWNER NAME</FormLabel>
                    <FormControl><Input {...field} className="font-mono" placeholder="John Doe" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="vehicleType" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs">TYPE</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="font-mono"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="car">CAR</SelectItem>
                          <SelectItem value="truck">TRUCK</SelectItem>
                          <SelectItem value="bike">BIKE</SelectItem>
                          <SelectItem value="bus">BUS</SelectItem>
                          <SelectItem value="other">OTHER</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs">STATUS</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="font-mono"><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="active">ACTIVE</SelectItem>
                          <SelectItem value="inactive">INACTIVE</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createVehicle.isPending} className="font-mono">
                    {createVehicle.isPending ? "SAVING..." : "SAVE RECORD"}
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
            <Car className="h-4 w-4" /> Registry Database
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs">PLATE</TableHead>
                <TableHead className="font-mono text-xs">OWNER</TableHead>
                <TableHead className="font-mono text-xs">TYPE</TableHead>
                <TableHead className="font-mono text-xs">STATUS</TableHead>
                <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : vehicles?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center font-mono text-sm text-muted-foreground py-8">
                    NO VEHICLES FOUND
                  </TableCell>
                </TableRow>
              ) : (
                vehicles?.map(vehicle => (
                  <TableRow key={vehicle.id} className="border-border" data-testid={`row-vehicle-${vehicle.id}`}>
                    <TableCell className="font-mono font-bold text-primary tracking-wider">{vehicle.plateNumber}</TableCell>
                    <TableCell className="font-mono">{vehicle.ownerName}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground uppercase">{vehicle.vehicleType}</TableCell>
                    <TableCell>
                      {vehicle.status === 'active' ? (
                        <Badge variant="outline" className="border-success/50 text-success bg-success/10 font-mono gap-1 text-[10px]">
                          <Activity className="h-3 w-3" /> ACTIVE
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-muted/50 text-muted-foreground bg-muted/10 font-mono gap-1 text-[10px]">
                          <ShieldBan className="h-3 w-3" /> INACTIVE
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Dialog open={editingVehicle?.id === vehicle.id} onOpenChange={(open) => {
                        if (open) {
                          setEditingVehicle(vehicle);
                          editForm.reset({ plateNumber: vehicle.plateNumber, ownerName: vehicle.ownerName, vehicleType: vehicle.vehicleType, status: vehicle.status });
                        } else {
                          setEditingVehicle(null);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="border-border bg-card">
                          <DialogHeader>
                            <DialogTitle className="font-mono">EDIT VEHICLE</DialogTitle>
                          </DialogHeader>
                          <Form {...editForm}>
                            <form onSubmit={editForm.handleSubmit(handleUpdate)} className="space-y-4">
                              <FormField control={editForm.control} name="plateNumber" render={({ field }) => (
                                <FormItem><FormLabel className="font-mono text-xs">PLATE NUMBER</FormLabel><FormControl><Input {...field} className="font-mono uppercase" /></FormControl></FormItem>
                              )} />
                              <FormField control={editForm.control} name="ownerName" render={({ field }) => (
                                <FormItem><FormLabel className="font-mono text-xs">OWNER</FormLabel><FormControl><Input {...field} className="font-mono" /></FormControl></FormItem>
                              )} />
                              <div className="grid grid-cols-2 gap-4">
                                <FormField control={editForm.control} name="vehicleType" render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="font-mono text-xs">TYPE</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl><SelectTrigger className="font-mono"><SelectValue /></SelectTrigger></FormControl>
                                      <SelectContent>
                                        <SelectItem value="car">CAR</SelectItem>
                                        <SelectItem value="truck">TRUCK</SelectItem>
                                        <SelectItem value="bike">BIKE</SelectItem>
                                        <SelectItem value="bus">BUS</SelectItem>
                                        <SelectItem value="other">OTHER</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )} />
                                <FormField control={editForm.control} name="status" render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="font-mono text-xs">STATUS</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl><SelectTrigger className="font-mono"><SelectValue /></SelectTrigger></FormControl>
                                      <SelectContent>
                                        <SelectItem value="active">ACTIVE</SelectItem>
                                        <SelectItem value="inactive">INACTIVE</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )} />
                              </div>
                              <DialogFooter>
                                <Button type="submit" disabled={updateVehicle.isPending} className="font-mono">UPDATE</Button>
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
                            <AlertDialogTitle className="font-mono">DELETE VEHICLE RECORD?</AlertDialogTitle>
                            <AlertDialogDescription className="font-mono text-sm text-muted-foreground">
                              This removes the vehicle from the registry. Related logs will remain but lose owner details.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(vehicle.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono">
                              DELETE
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
