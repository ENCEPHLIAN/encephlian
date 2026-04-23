import { supabase } from "@/integrations/supabase/client";
import { formatEdgeFunctionError } from "@/lib/edgeFunctionError";

export type CreateOrderPayload = { tokens: number } | { product: string };

export async function loadRazorpayScript(): Promise<void> {
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });
}

type VerifyHandler = (response: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) => Promise<void>;

/**
 * Creates a Supabase-backed Razorpay order and opens checkout.
 * `create_order` must accept the same payload shape as `CreateOrderPayload`.
 */
export async function openRazorpayTokenCheckout(
  orderBody: CreateOrderPayload,
  options: {
    description: string;
    onPaid: VerifyHandler;
    onDismiss?: () => void;
  },
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("create_order", {
    body: orderBody,
  });
  if (error) {
    throw new Error(await formatEdgeFunctionError(error, data));
  }
  if (!data || typeof data !== "object") {
    throw new Error("No response from payment server");
  }
  if ("error" in data && typeof (data as { error?: string }).error === "string") {
    throw new Error((data as { error: string }).error);
  }
  const d = data as { keyId?: string; orderId?: string; amountPaise?: number; currency?: string };
  if (!d.keyId || !d.orderId || d.amountPaise == null) {
    throw new Error("Invalid order response");
  }

  await loadRazorpayScript();

  const Razorpay = (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { open: () => void } })
    .Razorpay;

  const rzp = new Razorpay({
    key: d.keyId,
    amount: d.amountPaise,
    currency: d.currency || "INR",
    name: "ENCEPHLIAN",
    description: options.description,
    order_id: d.orderId,
    handler: async (response: Record<string, string>) => {
      await options.onPaid({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
    },
    prefill: {
      email: (await supabase.auth.getUser()).data.user?.email || "",
    },
    modal: {
      ondismiss: () => options.onDismiss?.(),
    },
  });
  rzp.open();
}
