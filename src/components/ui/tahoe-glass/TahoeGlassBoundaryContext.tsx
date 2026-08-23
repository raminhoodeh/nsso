"use client";

import * as React from "react";

/**
 * A direct backdrop lens already refracts the composed scene behind its shell.
 * Descendant glass controls keep their material and rim, but must not add a
 * second displacement pass to the shared scene underneath that lens.
 */
export const TahoeGlassDirectBackdropBoundaryContext =
  React.createContext(false);
