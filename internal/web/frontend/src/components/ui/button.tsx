import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border text-sm font-medium transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-accent bg-accent text-on-accent shadow-control hover:bg-accent-hover",
        outline:
          "border-border bg-surface-raised text-text-secondary shadow-control hover:border-border-strong hover:bg-surface-secondary hover:text-text-primary",
        ghost:
          "border-transparent text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
        destructive:
          "border-destructive bg-destructive-subtle text-destructive hover:bg-destructive hover:text-on-accent",
        link:
          "border-transparent text-accent underline-offset-4 hover:text-accent-hover hover:underline",
      },
      size: {
        default: "h-10 gap-2 px-3",
        sm: "h-8 gap-1 px-2",
        icon: "size-10",
        "icon-sm": "size-8",
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
