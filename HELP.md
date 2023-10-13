# Kramer VS-411XS

This module allows control of Kramer VS-411XS using [Protocol 3000 (PDF)](https://k.kramerav.com/downloads/protocols/protocol_3000_3.0_master_user.pdf).
This is a fork of the generic Kramer Matrix module to allow for more control.


## Instance Configuration
_Consult your product manual for information about how to set an IP address and what your matrix supports._

1. Configure your matrix with an IP address and enter it into the `Target IP` field.
3. Choose whether your matrix uses TCP (port 5000) or UDP (port 50000).

## Actions
### Switch Audio
Changes the audio routing of inputs to outputs.


### Switch Video
Changes the video routing of inputs to outputs.

You can route a specific input to an output, an input to all outputs, or disconnect all outputs.


### Switch Audio (Dynamic)
Changes the audio routing of inputs to outputs, but allows **custom variables** to define those inputs/outputs. See Companion's **Getting started** guide for more information.


### Switch Video (Dynamic)
Changes the video routing of inputs to outputs, but allows **custom variables** to define those inputs/outputs. See Companion's **Getting started** guide for more information.
