import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary — vivid dodger blue with gradient & glow on hover
        default:
          "bg-gradient-to-b from-[hsl(210,100%,65%)] to-[hsl(210,100%,55%)] text-[hsl(214,50%,8%)] border-[hsl(210,100%,48%)] shadow-[0_2px_8px_hsl(210,100%,50%,0.35)] hover:from-[hsl(210,100%,72%)] hover:to-[hsl(210,100%,62%)] hover:text-[hsl(214,50%,6%)] hover:shadow-[0_4px_20px_hsl(210,100%,55%,0.55)] active:scale-[0.98] transition-all duration-200",
        // Outline — shows border, fills with navy-blue on hover
        outline:
          "border-[hsl(214,40%,30%)] bg-[hsl(214,48%,15%)] text-[hsl(210,60%,90%)] hover:bg-[hsl(210,80%,22%)] hover:border-[hsl(210,100%,62%)] hover:text-[hsl(210,100%,88%)] hover:shadow-[0_0_12px_hsl(210,100%,55%,0.25)] active:scale-[0.98] transition-all duration-200",
        // Secondary — medium navy with steel-blue hover
        secondary:
          "bg-[hsl(214,40%,20%)] text-[hsl(210,60%,88%)] border-[hsl(214,40%,28%)] hover:bg-[hsl(214,50%,26%)] hover:border-[hsl(210,70%,45%)] hover:text-[hsl(210,80%,92%)] active:scale-[0.98] transition-all duration-200",
        // Ghost — transparent with blue highlight on hover
        ghost:
          "text-[hsl(210,60%,85%)] hover:bg-[hsl(210,80%,20%)] hover:text-[hsl(210,90%,90%)] active:scale-[0.98] transition-all duration-200",
        // Destructive — red tint with red glow on hover
        destructive:
          "bg-[hsl(0,70%,18%)] text-[hsl(0,90%,75%)] border-[hsl(0,70%,30%)] hover:bg-[hsl(0,75%,24%)] hover:border-[hsl(0,85%,55%)] hover:text-[hsl(0,100%,88%)] hover:shadow-[0_0_16px_hsl(0,85%,55%,0.40)] active:scale-[0.98] transition-all duration-200",
        link: "text-[hsl(210,100%,65%)] underline-offset-4 hover:underline hover:text-[hsl(210,100%,82%)] transition-colors duration-150",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
