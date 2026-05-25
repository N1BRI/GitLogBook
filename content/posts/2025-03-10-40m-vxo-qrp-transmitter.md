---
title: "40M VXO QRP Transmitter"
date: "2025-03-10"
summary: "A first step toward designing and building a 40m QRP CW transceiver: a simple VXO transmitter using 2N2222 stages and an IRF510 final."
tags: ["homebrew", "cw", "qrp", "40m"]
source: "KeyKlix - March 2025"
---

One of my main aspirations in the ham radio hobby is to design and build a 40m QRP CW transceiver. This is an ambitious goal for someone without formal training in electronics or RF design, but with the wealth of online resources available and the guidance of experienced MARC members I believe it's achievable with effort. That being said, I'm a long way from a transceiver and I have so much to learn. I learn best by practicing, getting my hands dirty, and making mistakes.

![40m VXO QRP transmitter schematic](/assets/posts/40m-vxo-qrp-transmitter/schematic.jpg)

Transmitters are much easier than receivers, so that's where I started. I've been intrigued with variable crystal oscillators (VXO) ever since I read the short article Daniel Bare AB7SQ and John Clements KC9ON put out on "pulling" quartz crystals. Any transmitter needs an oscillator, and anybody who has ever built an LC oscillator knows that building a stable one is very difficult, especially if it is tunable or variable.

Quartz crystals give you rock-solid stability at a fixed frequency. This paper says we can get stability and frequency variability, cake to have and to eat. There are plenty of sophisticated methods for creating variable frequency oscillators. This is not one of them, which is why I was attracted to it. The design I came up with is simple and undoubtedly flawed.

![Oscillator, buffer amplifier, power amplifier, and matching/filtering block diagram](/assets/posts/40m-vxo-qrp-transmitter/block-diagram.jpg)

![Reverse Beacon Network spots for the 40m transmitter](/assets/posts/40m-vxo-qrp-transmitter/spots.jpg)

![Built 40m VXO QRP transmitter board](/assets/posts/40m-vxo-qrp-transmitter/transmitter-board.jpg)

I used 2N2222 NPN transistors for the oscillator, buffer and keying, and an IRF510 for the power amplifier. I'm getting about 3 watts at 12 volts and I have a frequency range of about 10kHz, 7056-7046. There is a T/R switch which essentially just knocks the oscillator off the frequency your receiver is tuned to and back again for transmit.

The matching was done totally by trial and error and is surely not as good as it could be. I apply just enough signal from the buffer amp to the gate of the IRF510 to almost turn it on and then key the bias. I think this could be better too. But I'm making contacts and it is a lot of fun. Hope to catch you on 40M!
