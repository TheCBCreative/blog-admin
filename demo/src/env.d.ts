/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** This visitor's demo sandbox — set by middleware on every admin request. */
    sandbox?: import('./lib/sandbox').Sandbox;
  }
}
