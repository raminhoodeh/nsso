"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  AdaptiveTahoeGlassSurface as TahoeGlassSurface,
  type TahoeGlassContentTone,
  type TahoeGlassSemanticTint,
} from "./AdaptiveTahoeGlassSurface";

type TahoeFieldControlProps =
  | React.InputHTMLAttributes<HTMLInputElement>
  | React.SelectHTMLAttributes<HTMLSelectElement>
  | React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export interface TahoeGlassFieldProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  children: React.ReactElement<TahoeFieldControlProps>;
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  labelClassName?: string;
  surfaceClassName?: string;
  controlClassName?: string;
  tone?: TahoeGlassContentTone;
  semanticTint?: TahoeGlassSemanticTint;
  semanticTintOpacity?: number;
  visuallyHideLabel?: boolean;
}

function joinIds(...ids: Array<string | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

/**
 * A label-safe form wrapper. The field shell owns the recessed Tahoe lens;
 * the native input/select/textarea remains selectable, focusable, and in the
 * form tree with all caller props and refs preserved by cloneElement.
 */
export const TahoeGlassField = React.forwardRef<
  HTMLDivElement,
  TahoeGlassFieldProps
>(function TahoeGlassField(
  {
    children,
    label,
    description,
    error,
    className,
    labelClassName,
    surfaceClassName,
    controlClassName,
    tone = "inherit",
    semanticTint = "none",
    semanticTintOpacity,
    visuallyHideLabel = false,
    ...props
  },
  forwardedRef,
) {
  const generatedId = React.useId();
  const controlProps = children.props as TahoeFieldControlProps;
  const controlId = controlProps.id || `${generatedId}-control`;
  const descriptionId = description ? `${generatedId}-description` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = joinIds(
    controlProps["aria-describedby"],
    descriptionId,
    errorId,
  );

  const control = React.cloneElement(children, {
    id: controlId,
    className: cn(
      "relative z-20 min-w-0 w-full select-text bg-transparent text-inherit outline-none placeholder:text-current/55 disabled:cursor-not-allowed disabled:opacity-55",
      controlProps.className,
      controlClassName,
    ),
    "aria-describedby": describedBy,
    "aria-invalid": controlProps["aria-invalid"] ?? Boolean(error),
  } as TahoeFieldControlProps);

  return (
    <div
      ref={forwardedRef}
      className={cn("pointer-events-auto select-text", className)}
      {...props}
    >
      {label != null && (
        <label
          htmlFor={controlId}
          className={cn(
            "mb-1.5 block select-text text-sm font-medium",
            visuallyHideLabel && "sr-only",
            labelClassName,
          )}
        >
          {label}
        </label>
      )}

      <TahoeGlassSurface
        variant="recessed"
        radius={12}
        tone={tone}
        semanticTint={semanticTint}
        semanticTintOpacity={semanticTintOpacity}
        className={cn("w-full px-3.5 py-3", surfaceClassName)}
        contentClassName="w-full select-text"
      >
        {control}
      </TahoeGlassSurface>

      {description != null && (
        <p id={descriptionId} className="mt-1.5 select-text text-xs opacity-75">
          {description}
        </p>
      )}
      {error != null && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 select-text text-xs text-red-600 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
});

TahoeGlassField.displayName = "TahoeGlassField";
