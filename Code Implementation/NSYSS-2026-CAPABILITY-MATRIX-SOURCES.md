# NSysS 2026 — capability matrix: primary-source evidence

**Status:** Research note · 2026-08-19
**Scope:** Verbatim citations for every cell of the related-systems comparison matrix —
DTN/BPv7+BPSec · Serval (Rhizome, MeshMS) · Bridgefy · ActivityPub/Mastodon · Matrix · AT Protocol
**Method:** primary sources only — IETF RFC text at `rfc-editor.org`, W3C Recommendations at `w3.org/TR`,
`spec.matrix.org`, `atproto.com/specs`, `dasl.ing`, project source code and developer docs served as raw
bytes from `raw.githubusercontent.com`, first-party vendor blog posts, IACR ePrint, the USENIX
proceedings PDF, NVD's CVE API, and GitHub Security Advisories.
**Explicitly not used:** blog summaries of specifications, aggregator write-ups, Wikipedia, Grokipedia,
security-news sites, or search-engine answer boxes. Where a claim reached me only through a search
snippet it was discarded unless traced to the document that owns it.

**Reading rule for this file.** Every factual line is either (a) a verbatim quote with a URL and a
section number, or (b) explicitly marked **NOT FOUND — spec is silent**. There are no inferred cells.
Where the honest answer is "optional", the normative keyword that settles it is quoted inline.

**Retrieval date for every URL below: 2026-08-19.** Two of these documents are moving targets — the
AT Protocol repository spec (§6) and the Mastodon security docs (§4) — and both are dated in place.

---

## 1. DTN — Bundle Protocol v7 (RFC 9171) and BPSec (RFC 9172)

Source texts: <https://www.rfc-editor.org/rfc/rfc9171.txt> (Standards Track, January 2022),
<https://www.rfc-editor.org/rfc/rfc9172.txt> (Standards Track, January 2022),
<https://www.rfc-editor.org/rfc/rfc9173.txt> (default security contexts, January 2022).

### 1.1 Does BPv7 itself provide integrity or authenticity of the payload?

**No. BPv7's only native mechanism is a CRC, which is error detection, not integrity or authenticity.
Everything cryptographic is delegated to BPSec.**

RFC 9171 §4.2.1 ("CRC Type"), closing note:

> Note that more robust protection of BP data integrity, as needed, may be provided by means of Block
> Integrity Blocks (BIBs) as defined in the Bundle Protocol Security specification [BPSEC].

RFC 9171 §4.2.1 also makes the CRC itself optional per block:

> CRC type is an unsigned integer type code for which the following values (and no others) are valid:
> *  0 indicates "no Cyclic Redundancy Check (CRC) is present."

RFC 9171 §8 (Security Considerations), opening paragraph — the delegation is normative:

> The Bundle Protocol security architecture and the available security services are specified in an
> accompanying document, the Bundle Protocol Security (BPSec) specification [BPSEC].  Whenever Bundle
> Protocol security services (as opposed to the security services provided by overlying application
> protocols or underlying convergence-layer protocols) are required, those services SHALL be provided
> by BPSec rather than by some other mechanism with the same or similar scope.

The one place BPv7 forces *something* is the primary block, and even there BPSec is the alternative,
not an addition. RFC 9171 §4.3.1 (Primary Bundle Block), "CRC" field:

> CRC:  A CRC SHALL be present in the primary block unless the bundle includes a BPSec Block Integrity
> Block [BPSEC] whose target is the primary block, in which case a CRC MAY be present in the primary
> block.

and the same section's "CRC Type" field:

> The CRC type code for the primary block MAY be zero if the bundle contains a BPSec Block Integrity
> Block [BPSEC] whose target is the primary block; otherwise, the CRC type code for the primary block
> MUST be non-zero.

**Net:** a conformant BPv7 bundle carrying no BPSec blocks is protected by a CRC-16 or CRC-32C on the
primary block and, at the sender's option, nothing at all on the payload block. That is detection of
corruption, not of an adversary.

### 1.2 Is BPSec mandatory or optional?

**Both, and the distinction is the finding.** Implementing BPSec is mandatory for any BPA that sources,
verifies or accepts a bundle; *using* it on any given bundle is optional.

RFC 9171 §8, paragraph 2 — quoted in full because both sentences matter:

> A Bundle Protocol Agent (BPA) that sources, cryptographically verifies, and/or accepts a bundle MUST
> implement support for BPSec.  Use of BPSec for any single bundle is optional.

The normative keyword is **MUST** on *implementation* and the plain word *optional* on *use*. There is
no MUST, SHOULD, or even MAY attaching a BIB to a payload block anywhere in RFC 9171 or RFC 9172.

RFC 9172 §1.2 (Specification Scope) confirms that policy — i.e. "when must a BIB be present?" — is
deliberately out of scope:

> This specification does not address the implementation of security policies and does not provide a
> security policy for the BPSec.  Similar to cipher suites, security policies are based on the nature
> and capabilities of individual networks and network operational concepts.

RFC 9172 §6 (Key Management), in full:

> There exists a myriad of ways to establish, communicate, and otherwise manage key information in DTN.
> Certain DTN deployments might follow established protocols for key management, whereas other DTN
> deployments might require new and novel approaches.  BPSec assumes that key management is handled as
> a separate part of network management; this specification neither defines nor requires a specific
> strategy for key management.

### 1.3 Is a BIB a signature?

**Not necessarily, and the default security context is not one.** This is the highest-value nuance in
this section because RFC 9171 §8 itself uses loose language that the specification proper contradicts.

RFC 9171 §8, paragraph 3, calls a BIB a signature block:

> The BPSec extensions to the Bundle Protocol enable each block of a bundle (other than a BPSec
> extension block) to be individually authenticated by a signature block (Block Integrity Block, or
> BIB) […]

RFC 9172 §3.7 (Block Integrity Block) is weaker, and it is the normative one:

> The security context MUST utilize an authentication mechanism or an error detection mechanism.

RFC 9173 §3.1 (Overview) — the *default*, and the only integrity context defined for interoperability —
is a symmetric MAC:

> The BIB-HMAC-SHA2 security context provides a keyed-hash Message Authentication Code (MAC) over a set
> of plaintext information.

and §3.1's stated rationale:

> 1.  The use of symmetric keys allows this security context to be used in places where an
>     asymmetric-key infrastructure (such as a public key infrastructure) might be impractical.

RFC 9173 §4.1 (Key Considerations) reinforces it:

> HMAC keys used with this context MUST be symmetric and MUST have a key length equal to the output of
> the HMAC.

**Consequence for the matrix:** with the default context, a BIB gives a *verifier who already holds the
shared key* integrity assurance. It gives no third party anything, and it is not non-repudiable. Any
row that reads "DTN: signed payloads" is wrong unless a non-default asymmetric security context is
assumed, and no such context is defined in RFC 9173.

### 1.4 Peer trust states (probation / trusted / blocked)?

**NOT FOUND — spec is silent.** A case-insensitive search of the full RFC 9171 text for
`trust|probation|revoke|audit|transparency|reputation|whitelist|allowlist` returns only the IETF Trust
boilerplate in the copyright notice. The same search over RFC 9172 returns the copyright boilerplate
plus exactly three substantive hits, none of which define a state machine:

RFC 9172 §1 (Introduction):

> It should be presumed that the BP will be deployed in an untrusted network, which poses the usual
> security challenges related to confidentiality and integrity.

RFC 9172 §1.2:

> Completely trusted networks are extremely uncommon.

RFC 9172 §9.2, on opportunistic access:

> This may make asymmetric cryptographic architectures that rely on a key distribution center or other
> trust center impractical under certain conditions.

There is no notion of a per-peer trust level, no admission procedure, no promotion or demotion, and no
vouching. RFC 9172 §7 (Security Policy Considerations) enumerates policy questions an operator must
answer and leaves all of them to the deployment.

### 1.5 Transparency or audit log?

**NOT FOUND — spec is silent.** Neither RFC 9171 nor RFC 9172 contains the strings `transparency`,
`audit`, `Merkle`, `tree head`, or `gossip`. BPv7 does define *bundle status reports*, but these are
per-bundle delivery telemetry, not an append-only log of what was accepted, and §8 notes they are a DoS
vector:

> Note that the generation of bundle status reports is disabled by default because malicious initiation
> of bundle status reporting could result in the transmission of extremely large numbers of bundles,
> effecting a denial-of-service attack.

Also worth recording, because it is a *stated non-goal* rather than an omission — RFC 9172 §1.1:

> NOTE: Hop-by-hop authentication is NOT a supported security service in this specification, for two
> reasons:
> 1.  The term "hop-by-hop" is ambiguous in a BP overlay, as nodes that are adjacent in the overlay may
>     not be adjacent in physical connectivity. […]
> 2.  Hop-by-hop authentication cannot be deployed in a network if adjacent nodes in the network have
>     incompatible security capabilities.

---

## 2. Serval Project — Rhizome and MeshMS

Source texts: `serval-dna` `development` branch, February 2016 documentation, retrieved as raw Markdown
so the quotes are the authors' bytes and not a rendering:
<https://raw.githubusercontent.com/servalproject/serval-dna/development/doc/REST-API-Rhizome.md>,
<https://raw.githubusercontent.com/servalproject/serval-dna/development/doc/REST-API-MeshMS.md>,
<https://raw.githubusercontent.com/servalproject/serval-dna/development/rhizome_cli.c>.
The `developer.servalproject.org` dokuwiki did not resolve on 2026-08-19 (connection failure, zero bytes
returned); the `serval-dna` repository docs are the surviving primary source.

### 2.1 Are Rhizome bundles signed by an author key?

**Signed: yes. By an author key: NO — and this is the single most commonly misstated fact about
Rhizome.** Every bundle is signed by a *per-bundle* random keypair, not by the author's identity.

`REST-API-Rhizome.md`, section "Bundle Secret":

> A *Bundle Secret* is the [Curve25519][] cryptographic secret key that produces a [Bundle
> ID](#bundle-id) public key, and is generated randomly when the bundle is first created.
>
> Every bundle is cryptographically signed by its own Bundle Secret, and the signature is distributed
> along with the bundle's content.  This allows all recipients to verify whether the bundle was in fact
> produced by the owner of the Bundle Secret.  Bundles that do not verify are not stored or
> synchronised.
>
> There is no restriction on the random generation of Bundle Secrets, so any party may create, sign and
> publish as many bundles as desired.  However, only the possessor of a Bundle Secret may publish an
> *update* to a bundle (same Bundle ID, higher version).  The signature therefore prevents forgery of
> updates to existing bundles.

The property proved by a Rhizome signature is therefore **update authority over that Bundle ID**, not
authorship. Same document, section "Bundle author":

> Manifests do not store the author [SID][] explicitly.  Rhizome does not support a manifest field
> called `author`.  Instead, the bundle author is deduced from the `BK` field, if present.  The `BK`
> field relieves authors from having to retain and protect all their Bundle Secrets, and it does so
> without revealing the identity of the author.

and, decisively:

> Rhizome nodes that do not possess the unlocked author identity cannot derive the [SID][] of the
> author, *even if the SID is already known to them through other means*, since they do not possess the
> author's Rhizome Secret.  Thus, the identity of the author is hidden even if a `BK` field is present.

The nearest thing to an author claim is unauthenticated:

> The nearest thing to an "author" field is the optional `sender` field, to which a bundle's creator can
> assign any SID it wishes, so it carries no guarantee of validity.

### 2.2 Can a recipient verify without contacting a server or any infrastructure?

**Yes, for the property the signature actually proves.** The verification key *is* the identifier and
travels inside the bundle, so verification needs no lookup, no directory and no network.

`REST-API-Rhizome.md`, section "Bundle ID":

> Every [Bundle](#bundle) in Rhizome is identified by its *Bundle ID* (abbreviated to [BID][], sometimes
> known as "Manifest ID"), which is a unique 256-bit public key in the [Curve25519][] key space,
> generated from the random [Bundle Secret](#bundle-secret) when the bundle is first created.

Payload integrity binds to the signed manifest by hash — same document, "Manifest" field list:

> *  `filehash` - the 512-bit cryptographic [SHA-512][] digest of the payload's content; 128 uppercase
>    hexadecimal digits.

Manifest structure — same document, section "Manifest":

>     MANIFEST = METADATA NUL SIGNATURE
>
> If the NUL byte is missing, then the manifest is *unsigned*.

and the signature block, same section:

> The only supported signature type is 23 (hex 17), which is a 96-byte signature that is verified using
> [Curve25519][].

MeshMS confirms serverless operation for messaging — `REST-API-MeshMS.md`, "Conversation":

> There is no central server to assign a common ordering to messages in a conversation, both parties
> will see their outgoing messages threaded with received messages in the order they arrived locally.

**Important caveat, and a candidate for the "common belief is wrong" list:** a *valid* manifest and a
*verified* manifest are different states in Rhizome, and the spec says so explicitly —
`REST-API-Rhizome.md`, section "Valid manifest":

> Note that *validity* does not require that the manifest's signature be *verified*.  A manifest with an
> unverified or missing signature may still be *valid*.

### 2.3 Does Rhizome support deletion, and does deletion leave a trace?

**There is a local delete. It is store eviction, it does not propagate, and it leaves no tombstone.**

There is no `DELETE` verb in the Rhizome REST API at all. The complete endpoint list in
`REST-API-Rhizome.md` is: `GET /restful/rhizome/bundlelist.json`,
`GET /restful/rhizome/newsince[/TOKEN]/bundlelist.json`, `GET /restful/rhizome/BID.rhm`,
`GET /restful/rhizome/BID/raw.bin`, `GET /restful/rhizome/BID/decrypted.bin`,
`POST /restful/rhizome/insert`, `POST /restful/rhizome/append`, `POST /restful/rhizome/import`.

A CLI delete does exist. `rhizome_cli.c`, lines 424–429:

```c
DEFINE_CMD(app_rhizome_delete, 0,
  "Remove the manifest, or payload, or both for the given Bundle ID from the Rhizome store",
  "rhizome","delete","manifest|payload|bundle","<manifestid>");
DEFINE_CMD(app_rhizome_delete, 0,
  "Remove the file with the given hash from the Rhizome store",
  "rhizome","delete","|file","<fileid>");
```

Note the wording the authors chose: "from the Rhizome store" — the local one. Nothing in the command or
in the REST documentation propagates a deletion, and the sync model actively works against it:

`REST-API-Rhizome.md`, "Introduction":

> […] they spontaneously perform *Rhizome synchronisation*, during which each provides a list of its own
> content to the other, and then chooses which of the other's content to fetch.

so a locally deleted bundle is re-fetchable from any peer that still holds it. The only *automatic*
removal is capacity-driven expiry, which is also silent:

> Every [Rhizome store](#rhizome-store) is limited in size, so during synchronisation, Rhizome *expires*
> older items of content to make way for newer items.  Rhizome gives priority to smaller items, and can
> be made to prioritise on other criteria such as geographical proximity to a location, sender,
> recipient, or content type.

The closest thing to a *signed* record of removal is the journal tail, which is an author-driven
truncation, not a deletion record — `REST-API-Rhizome.md`, manifest field list:

> *  `tail` - the byte offset within the journal at which the payload starts; ASCII decimal.  The
>    bundle's creator can advance the tail whenever it updates the bundle, to indicate that the
>    preceding bytes are no longer needed, so they can be deleted from Rhizome stores to reclaim space
>    and need not be synchronised, to save network load.

**Tombstone: NOT FOUND — spec is silent.** The string `tombstone` does not appear in either the Rhizome
or the MeshMS documentation.

---

## 3. Bridgefy

### 3.1 What Albrecht, Blasco, Jensen and Mareková found (CT-RSA 2021)

Paper 2021/214, *Mesh Messaging in Large-scale Protests: Breaking Bridgefy*, Cryptology ePrint Archive.
<https://eprint.iacr.org/2021/214> · DOI 10.1007/978-3-030-75539-3_16 · received 2021-03-02, revised
2021-05-21 · published elsewhere: CT-RSA 2021.

Abstract, verbatim and complete:

> Mesh messaging applications allow users in relative proximity to communicate without the Internet. The
> most viable offering in this space, Bridgefy, has recently seen increased uptake in areas experiencing
> large-scale protests (Hong Kong, India, Iran, US, Zimbabwe, Belarus), suggesting its use in these
> protests. It is also being promoted as a communication tool for use in such situations by its
> developers and others. In this work, we report on a security analysis of Bridgefy. Our results show
> that Bridgefy, as analysed, permitted its users to be tracked, offered no authenticity, no effective
> confidentiality protections and lacked resilience against adversarially crafted messages. We verified
> these vulnerabilities by demonstrating a series of practical attacks on Bridgefy. Thus, if protesters
> relied on Bridgefy, an adversary could produce social graphs about them, read their messages,
> impersonate anyone to anyone and shut down the entire network with a single maliciously crafted
> message.

The operative phrases for the matrix are **"offered no authenticity"** and **"impersonate anyone to
anyone"**. The analysis was performed in August 2020; the paper appeared in 2021.

### 3.2 What Bridgefy changed, and when — first-party confirmation

**Announced 2020-10-30.** Bridgefy press release, *Major Security Updates at Bridgefy!*, dated
`10/30/2020` on the page:
<https://blog.bridgefy.me/blog/press-release-major-security-updates-at-bridgefy/>

> On October 30, Bridgefy is launching a major update for the Bridgefy SDK and the Bridgefy App,
> improving security and privacy for all users.

> We adopted Signal, a renowned security protocol used by companies like Microsoft and Facebook to make
> sure users stay safe, and information kept private.

The same page lists the claimed outcomes, of which two bear directly on authenticity:

> A third person will no longer be able to impersonate any other user

> Man-in-the-middle attacks done by modifying stored keys will no longer be possible

The companion technical post, dated `10/31/2020`:
<https://blog.bridgefy.me/blog/technical-article-on-our-security-updates/>

> We chose to work with the Signal Protocol. […] The first thing we did is delete all the code for the
> old security model from our SDK, while keeping only our core mesh communications framework. Next, we
> started integrating Signal into the stack by using the Java library for Android and the C library for
> iOS. We had to adjust some key implementation elements (without altering any of the underlying
> libraries) to make it work through the mesh network instead of bouncing off a server over the
> internet, so we made all key exchanges happen in direct line-of-sight communication only (instead of
> over the mesh). We only used the server for initial device activations.

And — critical, because it scopes what Signal covers and what it does not — the same post on broadcast
and mesh-control traffic:

> To fix this, we decided to implement AES128 symmetric key encryption to protect every single message
> going through the mesh. […] we decided it was best to make encryption happen application-wide, meaning
> each different app gets its own symmetric key and encrypts their traffic with it.

An application-wide shared symmetric key provides confidentiality against outsiders and **no
authenticity whatsoever among app users**, since every installation holds the key.

### 3.3 Did the fix hold? (USENIX Security 2022)

Albrecht, Eikenberg and Paterson, *Breaking Bridgefy, again: Adopting libsignal is not enough*, 31st
USENIX Security Symposium, August 10–12 2022, pp. 269–286.
PDF: <https://www.usenix.org/system/files/sec22-albrecht.pdf>

Abstract, second and third paragraphs:

> In this work, we analyse the security of the revised Bridgefy messenger and SDK and invalidate its
> security claims. One attack (targeting the messenger) enables an adversary to compromise the
> confidentiality of private messages by exploiting a time-of-check to time-of-use (TOCTOU) issue,
> side-stepping Signal's guarantees. The other attack (targeting the SDK) allows an adversary to recover
> broadcast messages without knowing the network-wide shared encryption key.
>
> We also found that the changes deployed in response to the August 2020 analysis failed to remedy the
> previously reported vulnerabilities. In particular, we show that (i) the protocol persisted to be
> susceptible to an active attacker-in-the-middle, (ii) an adversary continued to be able to impersonate
> other users in the broadcast channel of the Bridgefy messenger, (iii) the DoS attack using a
> decompression bomb was still applicable, albeit in a limited form, and that (iv) the privacy issues of
> Bridgefy remained largely unresolved.

§1, itemised re-evaluation of Bridgefy 3.1.3:

> (1) The protocol persisted to be susceptible to an attacker in the middle. While the attack is now
> limited to the first exchange between a pair of users — it abuses the 'trust on first use' (TOFU)
> assumption — we note that Bridgefy offers users no option to verify the public keys of their contacts.
> (2) Broadcast messages continued to be unauthenticated; an adversary can exploit this to mount
> impersonation attacks.

§4.2 (Impersonation in the Broadcast Chat):

> An adversary can forge arbitrary broadcast messages. The adversary can send messages under the name of
> any userId and freely choose a payload content and display name. The reason for this is the lack of
> authentication for broadcast messages.

§1, on remediation status at time of writing:

> We asked the developers to comment on the remediation progress on 2022-02-04. At the time of finalising
> this paper, two weeks later, the state of the remediation remained unclear.

### 3.4 Is there any at-rest signature a THIRD party can verify?

**No — and it is a design goal of the Signal protocol that there is not.** Signal gives *deniability*,
which is the precise opposite of third-party verifiability. Stating this crisply is worth a sentence in
the paper, because "adopted Signal" is routinely read as "messages are now signed".

Signal's X3DH specification, Revision 1 (2016-11-04), §4.4 (Deniability):
<https://signal.org/docs/specifications/x3dh/>

> X3DH doesn't give either Alice or Bob a publishable cryptographic proof of the contents of their
> communication or the fact that they communicated.

X3DH §4.5 (Signatures) — deniability is explicitly traded *against* signatures:

> Alternatively, it might be tempting to replace the DH-based mutual authentication (i.e. DH1 and DH2)
> with signatures from the identity keys. However, this reduces deniability, increases the size of
> initial messages, and increases the damage done if ephemeral or prekey private keys are compromised, or
> if the signature scheme is broken.

Message-level authentication in the Double Ratchet is symmetric AEAD under a per-message key, not a
signature. Double Ratchet specification, §3.1 (External functions):
<https://signal.org/docs/specifications/doubleratchet/>

> ENCRYPT(mk, plaintext, associated_data): Returns an AEAD encryption of plaintext with message key mk.

**Therefore:** a Bridgefy private message can be authenticated *by its recipient* and by nobody else, by
construction. A Bridgefy broadcast message is not authenticated even by its recipient — it is encrypted
under a key every installation of the app holds (§3.2 above) and was still forgeable as of the 2022
analysis (§3.3). There is no at-rest, third-party-verifiable signature on any Bridgefy message in any
documented version.

**NOT FOUND — no first-party source** describing Bridgefy's protocol state after 2022 was located. The
last first-party technical description is the 2020-10-31 post quoted above. Do not assert anything about
Bridgefy's 2026 behaviour in the paper.

---

## 4. ActivityPub / ActivityStreams / Mastodon

### 4.1 (a) Does ActivityStreams 2.0 define a `Tombstone` object type?

**Yes.** *Activity Vocabulary*, W3C Recommendation 23 May 2017, §3.3 (Object and Link Types), class
definition `Tombstone`, anchor `#dfn-tombstone`:
<https://www.w3.org/TR/activitystreams-vocabulary/#dfn-tombstone>

> A Tombstone represents a content object that has been deleted. It can be used in Collections to signify
> that there used to be an object at this position, but it has been deleted.
>
> Extends: Object
> Properties: formerType | deleted

§4 (Properties), `deleted`:

> On a Tombstone object, the deleted property is a timestamp for when the object was deleted.
>
> Domain: Tombstone
> Range: xsd:dateTime
> Functional: True

Worked example from §3.3, Example 60 — note what survives is position, former type, id and timestamp, and
nothing else:

```json
{
  "type": "OrderedCollection",
  "totalItems": 3,
  "name": "Vacation photos 2016",
  "orderedItems": [
    { "type": "Image", "id": "http://image.example/1" },
    { "type": "Tombstone", "formerType": "Image", "id": "http://image.example/2",
      "deleted": "2016-03-17T00:00:00Z" },
    { "type": "Image", "id": "http://image.example/3" }
  ]
}
```

The vocabulary defines no author field, no acting-moderator field, and no reason field on a Tombstone.
**Attribution of a deletion: NOT FOUND — spec is silent.**

### 4.2 (b) Does ActivityPub require object-level signatures? HTTP Signatures?

**Neither is normative. The Recommendation specifies no authentication mechanism at all, and says so.**
*ActivityPub*, W3C Recommendation 23 January 2018: <https://www.w3.org/TR/activitypub/>

First, the conformance frame — §2 (Conformance):

> As well as sections marked as non-normative, all authoring guidelines, diagrams, examples, and notes in
> this specification are non-normative. Everything else in this specification is normative.
>
> The key words MAY, MUST, MUST NOT, SHOULD, and SHOULD NOT are to be interpreted as described in
> [RFC2119].

Now the decisive line — Appendix **B. Security Considerations** opens:

> B. Security Considerations
> This section is non-normative.

So *nothing* in Appendix B, including everything ActivityPub says about authentication, carries RFC 2119
force. §B.1 (Authentication and Authorization), in full:

> ActivityPub uses authentication for two purposes; first, to authenticate clients to servers, and
> secondly in federated implementations to authenticate servers to each other.
>
> Unfortunately at the time of standardization, there are no strongly agreed upon mechanisms for
> authentication.
>
> Some possible directions for authentication are laid out in the Social Web Community Group
> Authentication and Authorization best practices report.

§B.2 (Verification), in full — note the lowercase "should", in a section declared non-normative:

> Servers should not trust client submitted content, and federated servers also should not trust content
> received from a server other than the content's origin without some form of verification. Servers
> should be careful to verify that new content is really posted by the actor that claims to be posting
> it, and that the actor has permission to update the resources it claims to.

The normative body of the spec defers in the same direction — §3 (Objects):

> Servers SHOULD validate the content they receive to avoid content spoofing attacks. (A server should do
> something at least as robust as checking that the object appears as received at its origin, but
> mechanisms such as checking signatures would be better if available).
>
> No particular mechanism for verification is authoritatively specified by this document, but please see
> Security Considerations for some suggestions and good practices.

The strongest keyword anywhere on this axis is that **SHOULD**, and it attaches to *validate*, not to
*sign*. Linked Data Signatures and HTTP Signatures appear in the Recommendation exactly twice, both in
§4.1 (Actor objects) as *conditional* endpoint descriptions:

> provideClientKey
> If Linked Data Signatures and HTTP Signatures are being used for authentication and authorization, this
> endpoint specifies a URI at which browser-authenticated users may authorize a client's public key for
> client to server interactions.

> signClientKey
> If Linked Data Signatures and HTTP Signatures are being used for authentication and authorization, this
> endpoint specifies a URI at which a client key may be signed by the actor's key for a time window to act
> on behalf of the actor in interacting with foreign servers.

"If … are being used" is the entire normative weight. **Answer for the matrix:** ActivityPub requires
*neither* object-level signatures *nor* HTTP Signatures. Interoperable authentication in the fediverse is
a de-facto convention established by implementations, not a W3C requirement.

Mastodon's own documentation is candid about the resulting mess —
<https://docs.joinmastodon.org/spec/security/>, "Signed HTTP requests":

> Mastodon requires the use of HTTP signatures in order to validate that any activity received was
> authored by the actor generating it.

and, on the object-level layer, "Linked Data Signatures":

> Mastodon's current implementation of LD Signatures is outdated due to a change in the JSON-LD @context
> between the drafting stage and finalization stage of the specification. Mastodon expects a type of
> RsaSignature2017 while later drafts instead define RsaSignature2018 via the namespace
> https://w3id.org/security/v2. Furthermore, the LD Signatures specification as a whole has been superseded
> by the Verifiable Credential Data Integrity 1.0 specification, which is largely incompatible with the
> earlier LD Signature spec. For this reason, it is not advised to implement support for LD Signatures.

and on how narrowly object-level signatures are actually used:

> LD Signatures are not used widely within Mastodon, but they are used in the following situations: When
> running a self-destruct sequence to send Delete activities to all known peers […] When accepting
> activities from a relay.

Current direction, same page, "Object Integrity Proofs (FEP-8b32)":

> Version history: 4.7.0 (unreleased) - added support for validating FEP-8b32 Object Integrity proofs
> using the eddsa-jcs-2022 cryptosuite or mldsa44-jcs-2024 cryptosuite

> Mastodon currently prefers Linked Data Signatures and will only attempt to verify an Object Integrity
> Proof if the Linked Data Signature is absent or unverifiable.

(Retrieved 2026-08-19. "4.7.0 (unreleased)" is the docs' own wording as of that date — if the paper cites
this, date the citation.)

### 4.3 (c) What does Mastodon actually do on a `Delete`?

**It destroys the record. The `Tombstone` row it keeps is a private replay guard, not a public artifact,
and it holds no content, no reason and no acting moderator.**

Official docs, <https://docs.joinmastodon.org/spec/activitypub/>, "Payloads" table for objects:

> Delete    Removes a status from the database

and for actors:

> Delete    Remove an account from the database, as well as all of their statuses.

Source, `app/lib/activitypub/activity/delete.rb` (branch `main`, retrieved 2026-08-19):
<https://github.com/mastodon/mastodon/blob/main/app/lib/activitypub/activity/delete.rb>

```ruby
with_redis_lock("create:#{object_uri}") { delete_later!(object_uri) }

Tombstone.find_or_create_by(uri: object_uri, account: @account)
```

The model, `app/models/tombstone.rb` — the complete schema:

```
# Table name: tombstones
#
#  id           :bigint(8)        not null, primary key
#  by_moderator :boolean
#  uri          :string           not null
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  account_id   :bigint(8)        not null
```

The only consumer is the ingress replay guard — `app/lib/activitypub/activity/create.rb`:

```ruby
def create_status
  return reject_payload! if unsupported_object_type? || non_matching_uri_hosts?(@account.uri, object_uri) || tombstone_exists?
```

```ruby
def tombstone_exists?
  Tombstone.exists?(uri: object_uri)
end
```

The status itself is destroyed — `app/services/remove_status_service.rb`:

```ruby
@status.destroy! if permanently?
```

```ruby
def permanently?
  @options[:immediate] || !(@options[:preserve] || @status.reported?)
end
```

**No AS2 `Tombstone` object is ever served.** `app/controllers/statuses_controller.rb` renders only
`ActivityPub::NoteSerializer` for an existing status; a destroyed status yields the framework's
not-found path. Nothing in the tree serves HTTP 410 with a `Tombstone` body, which is the behaviour
ActivityPub §6.4 describes as a **SHOULD**:

> If the deleted object is requested the server SHOULD respond with either the HTTP 410 Gone status code
> if a Tombstone object is presented as the response body, otherwise respond with a HTTP 404 Not Found.

ActivityPub is itself explicit that remote deletion cannot be enforced — §7.4 (Delete Activity):

> The side effect of receiving this is that (assuming the object is owned by the sending actor/server) the
> server receiving the delete activity SHOULD remove its representation of the object with the same id,
> and MAY replace that representation with a Tombstone object. (Note that after an activity has been
> transmitted from an origin server to a remote server, there is nothing in the ActivityPub protocol that
> can enforce remote deletion of an object's representation).

### 4.4 (d) Mastodon CVEs relevant to federation origin validation

Descriptions below are quoted verbatim from NVD (`services.nvd.nist.gov/rest/json/cves/2.0`) or from the
GitHub Security Advisory that NVD references.

**CVE-2024-23832** — GHSA-3fjr-858r-92rw. Published 2024-02-01. CVSS 3.1 base 9.4 (GitHub) / 9.8 (NVD
secondary), vector `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:H`.
<https://nvd.nist.gov/vuln/detail/CVE-2024-23832> ·
<https://github.com/mastodon/mastodon/security/advisories/GHSA-3fjr-858r-92rw>

NVD description:

> Mastodon is a free, open-source social network server based on ActivityPub Mastodon allows configuration
> of LDAP for authentication. Due to insufficient origin validation in all Mastodon, attackers can
> impersonate and take over any remote account. Every Mastodon version prior to 3.5.17 is vulnerable, as
> well as 4.0.x versions prior to 4.0.13, 4.1.x version prior to 4.1.13, and 4.2.x versions prior to 4.2.5.

GHSA "Impact" section, which is more precise than NVD's:

> This vulnerability allowed attackers to impersonate any remote ActivityPub actor as observed from a
> vulnerable Mastodon server, even if the remote server did not use Mastodon. This vulnerability could
> also be used to overwrite existing objects, including protocol details, allowing attackers to intercept
> further trafic between a vulnerable Mastodon server and an impersonated remote ActivityPub actor.

(The "allows configuration of LDAP for authentication" clause in NVD's text is boilerplate carried across
several Mastodon CVEs and is unrelated to this vulnerability. Quote the GHSA, not NVD, if space is tight.
"trafic" is the advisory's own typo — keep it, or mark it `[sic]`.)

**CVE-2024-25623** — GHSA-jhrq-qvrm-qr36. Published 2024-02-19. CVSS 3.1 base 8.5, vector
`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:H/A:N`. <https://nvd.nist.gov/vuln/detail/CVE-2024-25623>

> Mastodon is a free, open-source social network server based on ActivityPub. Prior to versions 4.2.7,
> 4.1.15, 4.0.15, and 3.5.19, when fetching remote statuses, Mastodon doesn't check that the response from
> the remote server has a `Content-Type` header value of the Activity Streams media type, which allows a
> threat actor to upload a crafted Activity Streams document to a remote server and make a Mastodon server
> fetch it, if the remote server accepts arbitrary user uploads. The vulnerability allows a threat actor to
> impersonate an account on a remote server that satisfies all of the following properties: allows the
> attacker to register an account; accepts arbitrary user-uploaded documents and places them on the same
> domain as the ActivityPub actors; and serves user-uploaded document in response to requests with an
> `Accept` header value of the Activity Streams media type. Versions 4.2.7, 4.1.15, 4.0.15, and 3.5.19
> contain a fix for this issue.

**These two are the correct pair for an origin-validation cell.** CVE-2024-23832 is origin validation of a
*pushed* activity; CVE-2024-25623 is origin validation of a *pulled* document. Together they cover both
directions of the fetch/deliver model.

**Correction to a likely assumption: CVE-2023-36460 is NOT an origin-validation bug.** Its NVD description
is unambiguous and it belongs to a different row entirely:

> Mastodon is a free, open-source social network server based on ActivityPub. Starting in version 3.5.0 and
> prior to versions 3.5.9, 4.0.5, and 4.1.3, attackers using carefully crafted media files can cause
> Mastodon's media processing code to create arbitrary files at any location. This allows attackers to
> create and overwrite any file Mastodon has access to, allowing Denial of Service and arbitrary Remote
> Code Execution. Versions 3.5.9, 4.0.5, and 4.1.3 contain a patch for this issue.

That is arbitrary file write via media processing — the "TootRoot" RCE. Do not cite it as origin
validation; a reviewer who reads the CVE will catch it.

**Two 2026 CVEs that are even closer to this paper's thesis** (signature confusion via canonicalisation
ambiguity), worth a footnote because they are the fediverse's own instance of the bug class that canonical
encoding exists to foreclose:

CVE-2026-46349 — GHSA-chgx-jx3p-rf73, published 2026-06-24, CVSS 3.1 base 5.3:
<https://nvd.nist.gov/vuln/detail/CVE-2026-46349>

> Prior to 4.5.10, 4.4.17, and 4.3.23, Mastodon's normalization of incoming activities signed with
> Linked-Data Signatures does not sufficiently protect the activities from a certain class of spoofing,
> allowing attackers to re-arrange a valid signed JSON-LD activity from a third-party actor to have it
> processed differently. This vulnerability is fixed in 4.5.10, 4.4.17, and 4.3.23.

CVE-2026-48028 — GHSA-53m7-2wrh-q839, published 2026-06-24, CVSS 3.1 base 6.5:
<https://nvd.nist.gov/vuln/detail/CVE-2026-48028>

> Prior to 4.5.10, 4.4.17, and 4.3.23, Mastodon's normalization of incoming activities signed with
> Linked-Data Signatures does not sufficiently protect the activities from a certain class of spoofing,
> allowing threat actors to remove JSON entries from valid signed activities from a third-party actor. This
> vulnerability is fixed in 4.5.10, 4.4.17, and 4.3.23.

---

## 5. Matrix

Source: Matrix Specification **v1.19** (the current `latest` on 2026-08-19).
<https://spec.matrix.org/latest/client-server-api/>, <https://spec.matrix.org/latest/server-server-api/>,
<https://spec.matrix.org/latest/rooms/v11/>, <https://spec.matrix.org/latest/rooms/v12/>

### 5.1 Transparency log or gossip for detecting a homeserver that rewrote history?

**NOT FOUND — spec is silent.** A case-insensitive search of the full text of both the Client-Server API
and the Server-Server API for `transparency`, `gossip`, `audit log`, `tamper`, `equivocat`, `Merkle`,
`certificate transparency` and `rewrite` returns **exactly one hit across both documents**, and it is
about TLS, not about room history — Server-Server API §"TLS":

> Servers are encouraged to make use of the Certificate Transparency project.

There is no tree-head publication, no cross-server observation exchange, no fork-detection protocol, and
no append-only log of accepted events. The word `gossip` does not appear at all.

What Matrix *does* have is per-event signing plus a room DAG, which is tamper-evidence over events a
server already holds, not detection of what a server withheld or replaced. Server-Server API §"Validating
hashes and signatures on received events":

> When a server receives an event over federation from another server, the receiving server should check
> the hashes and signatures on that event. First the signatures are checked. The event is redacted
> following the redaction algorithm, and the resultant object is checked for signatures from the
> originating server, following the algorithm described in Checking for a signature.

> For room versions 3 and later, unless the event is a 3rd party invite, only the signature(s) from the
> originating server (the server the sender belongs to) are required for verification.

The spec itself concedes that detecting a misbehaving homeserver is manual and after-the-fact.
Client-Server API §"Server Access Control Lists (ACLs) for rooms", second Warning box:

> All compliant servers must implement server ACLs. However, legacy or noncompliant servers exist which do
> not uphold ACLs, and these MUST be manually appended to the denied hosts list when setting an ACL to
> prevent them from leaking events from banned servers into a room. Currently, the only way to determine
> noncompliant hosts is to check the prev_events of leaked events, therefore detecting servers which are
> not upholding the ACLs.

"Currently, the only way … is to check the prev_events of leaked events" is the spec admitting there is no
mechanism. Quote it directly; it is stronger than any absence claim.

### 5.2 Federation trust and ACL mechanisms

The mechanism is a **room-scoped state event with allow/deny glob lists**, enforced cooperatively.
Client-Server API §"Server Access Control Lists (ACLs) for rooms", event `m.room.server_acl`:

> In some scenarios room operators may wish to prevent a malicious or untrusted server from participating
> in their room. Sending an m.room.server_acl state event into a room is an effective way to prevent the
> server from participating in the room at the federation level.

> An event to indicate which servers are permitted to participate in the room. Server ACLs may allow or
> deny groups of hosts. All servers participating in the room, including those that are denied, are
> expected to uphold the server ACL. Servers that do not uphold the ACLs MUST be added to the denied hosts
> list in order for the ACLs to remain effective.

Evaluation order, same section:

> The ACLs are applied to servers when they make requests, and are applied in the following order:
> 1. If there is no m.room.server_acl event in the room state, allow.
> 2. If the server name is an IP address (v4 or v6) literal, and allow_ip_literals is present and false, deny.
> 3. If the server name matches an entry in the deny list, deny.
> 4. If the server name matches an entry in the allow list, allow.
> 5. Otherwise, deny.

Scope disclaimer, same section:

> Note: Server ACLs do not restrict the events relative to the room DAG via authorisation rules, but
> instead act purely at the network layer to determine which servers are allowed to connect and interact
> with a given room.

Enforcement is normative on the server — same section, "Server behaviour":

> Servers MUST prevent blacklisted servers from sending events or participating in the room when an
> m.room.server_acl event is present in the room state.

But the security model is honest about being cooperative — same section, "Security considerations":

> Server ACLs are only effective if every server in the room honours them. Servers that do not honour the
> ACLs may still permit events sent by denied servers into the room, leaking them to other servers in the
> room. To effectively enforce an ACL in a room, the servers that do not honour the ACLs should be denied
> in the room as well.

**Trust *states* (probation / trusted / blocked): NOT FOUND — spec is silent.** `m.room.server_acl` is a
binary, per-room allow/deny list. There is no graduated trust level, no probationary admission, no
vouching, and no global (non-room-scoped) peer state. Since Matrix v1.18 there is an optional **Policy
Server** (Server-Server API §"Policy Servers") which co-signs events in rooms that enable one — that is a
delegated moderation authority, not a peer-trust state machine.

### 5.3 Does Matrix redaction leave a tombstone, and what is preserved?

**Redaction leaves a stripped-but-still-present event — this is stronger than a tombstone, because the
event stays in the DAG and stays signed. It is unrelated to `m.room.tombstone`.**

Purpose — Client-Server API §"Redactions":

> Since events are extensible it is possible for malicious users and/or servers to add keys that are, for
> example, offensive or illegal. Since some events cannot be simply deleted, e.g. membership events, we
> instead 'redact' events. This involves removing all keys from an event that are not required by the
> protocol. This stripped down event is thereafter returned anytime a client or remote server requests it.
> Redacting an event cannot be undone, allowing server owners to delete the offending content from the
> databases. Servers should include a copy of the m.room.redaction event under unsigned as redacted_because
> when serving the redacted event to clients.

State semantics, same section:

> Redacted events can still affect the state of the room. When redacted, state events behave as though
> their properties were simply not specified, except those protected by the redaction algorithm.

**The preserved-field list**, quoted verbatim from Room Version 12 §"Redactions" (the algorithm is
unchanged from v11; v12 labels the section "Unchanged from v11"):
<https://spec.matrix.org/latest/rooms/v12/#redactions>

> Upon receipt of a redaction event, the server must strip off any keys not in the following list:
>
> - event_id
> - type
> - room_id
> - sender
> - state_key
> - content
> - hashes
> - signatures
> - depth
> - prev_events
> - auth_events
> - origin_server_ts
>
> The content object must also be stripped of all keys, unless it is one of the following event types:
>
> - m.room.member allows keys membership, join_authorised_via_users_server. Additionally, it allows the
>   signed key of the third_party_invite key.
> - m.room.create allows all keys.
> - m.room.join_rules allows keys join_rule, allow.
> - m.room.power_levels allows keys ban, events, events_default, invite, kick, redact, state_default,
>   users, users_default.
> - m.room.history_visibility allows key history_visibility.
> - m.room.redaction allows key redacts.

The `m.room.redaction` event itself carries the actor and, optionally, the reason — Client-Server API
§"Redactions", event `m.room.redaction`:

> reason (string) — The reason for the redaction, if any.
> redacts (Event ID) — The event ID that was redacted. Required for, and present starting in, room version 11.

with `sender` on the redaction event naming who did it.

**So the redaction record preserves, verbatim per the list above: the original event's id, type, room,
sender, timestamp, DAG position (`prev_events`, `auth_events`, `depth`), and its `hashes` and
`signatures` — plus, on the separate redaction event, the redactor and an optional reason.** This is a
substantially richer censorship record than an ActivityStreams `Tombstone`.

**Do not confuse this with `m.room.tombstone`.** Matrix's tombstone event has nothing to do with deletion
— Client-Server API §"Room Upgrades":

> m.room.tombstone
> A state event signifying that a room has been upgraded to a different room version, and that clients
> should go there.
>
> body (string) Required: A server-defined message.
> replacement_room (string) Required: The room ID of the new room the client should be visiting.

**One limit worth citing, because it is the exception to the above.** Account erasure is deliberately
*not* federated — Client-Server API, `POST /_matrix/client/v3/account/deactivate`, `erase` parameter:

> Erasure means that any users (or servers) which join the room after the erasure request are served
> redacted copies of the events sent by this account. Users which had visibility on those events prior to
> the erasure are still able to see unredacted copies. No redactions are sent and the erasure request is
> not shared over federation, so other servers might still serve unredacted copies.

---

## 6. AT Protocol

Sources: <https://atproto.com/specs/repository>, <https://atproto.com/specs/data-model>,
<https://atproto.com/specs/sync>, <https://dasl.ing/drisl.html>,
<https://web.plc.directory/spec/v0.1/did-plc>. All retrieved 2026-08-19.

### 6.1 Are repository commits signed?

**Yes.** `atproto.com/specs/repository`, §"Repository" (intro), paragraph 2:

> The repository data structure is a content-addressed Merkle-tree. Creating, updating, or deleting records
> (or any other mutations to the repository) changes the root hash value of the overall repository tree.
> Each published version of the repository tree structure is represented as a commit. Commits are
> cryptographically signed, with rotatable signing keys, which allows recursive authentication of either
> the repository structure as a whole, or compact "proof chains" for individual records.

Mechanics — same page, §"Commit Objects":

> sig (byte array, required): cryptographic signature of this commit, as raw bytes

> An unsigned commit object has all the same fields except for sig. The process for signing a commit is to
> populate all the data fields, and then serialize the unsigned commit with DRISL CBOR. The output bytes
> are then hashed with SHA-256, and the binary hash output (without hex encoding) is then signed using the
> current "signing key" for the account. The signature is then stored as raw bytes in a commit object,
> along with all the other data fields.

**Caveat the spec states itself**, same section, and it matters for any offline-verification claim:

> Note that neither the signature itself nor the signed commit indicate either the type of key used (curve
> type), or the specific public key used. That information must be fetched from the account's DID document.
> With key rotation, verification of older commit signatures can become ambiguous. The most recent commit
> should always be verifiable using the current DID document.

So atproto commit verification is **not** self-contained: it requires resolving the DID document, i.e.
contacting infrastructure (`plc.directory` for `did:plc`, or DNS/HTTPS for `did:web`).

**Second caveat, and it is the load-bearing one for a fork/rewrite argument** — same page, §"Commit
Objects", `prev` field:

> prev (CID link, nullable): pointer (by hash) to a previous commit object for this repository. Could be
> used to create a chain of history, but largely unused (included for v2 backwards compatibility). In
> version 3 repos, this field must exist in the CBOR object, but is virtually always null. NOTE: previously
> specified as nullable and optional, but this caused interoperability issues.

**An atproto repository is therefore a sequence of signed snapshots, not a hash chain.** Each commit
authenticates the *current* tree and nothing about what preceded it.

### 6.2 What is the canonical encoding TODAY? Did it change?

**Today it is DRISL CBOR. It previously said DAG-CBOR. The change is recent — establish the date in the
paper or the citation will read as stale to a 2027 reviewer.**

Current text, `atproto.com/specs/repository`, §"Repository" (intro), paragraph 3:

> Repositories and their contents are represented as a graph of data objects, encoded in DRISL CBOR and
> referencing each other by content hash (CID Links).

and §"Commit Objects":

> The CID for a commit overall is generated by serializing a signed commit object as DRISL CBOR. The DRISL
> CBOR (not "raw") codec should be used for CIDs linking to commit objects.

Definition and relationship to DAG-CBOR, `atproto.com/specs/data-model`, §"Data Model" (intro):

> The specific normalized subset of CBOR used in the atproto data model is called DRISL (which is successor
> to DAG-CBOR). All DRISL-CBOR data is valid CBOR, and can be read with any CBOR library.

**The multicodec did not change** — `atproto.com/specs/data-model`, §"CID Formats":

> Codec: DRISL (0x71; also known as dag-cbor) for links to DRISL-CBOR data objects, and raw (0x55) for
> links to blobs

The DRISL specification itself, <https://dasl.ing/drisl.html>, is dated **2026-08-18** (editors Robin
Berjon and Juan Caballero, a specification of the DASL Project) and states:

> DRISL is a serialization format that is deterministic (so that the same data will have the same CID) and
> that features native support for using CIDs as links.

> DRISL does not fork CBOR, CDE, or dCBOR ([cbor], [cde], [dcbor]), but it is a subset of features defined
> in CBOR "Core" ([cborc]), first defined in the earliest CBOR RFC and largely unaffected by refinements
> made since.

**Evidence for the change, and its date.** The prior text is recoverable from the Internet Archive.
Snapshot `20250114205657` of `https://atproto.com/specs/repository` contains `DAG-CBOR` eight times and
`DRISL` zero times, and reads:

> Repositories and their contents are canonically stored in binary DAG-CBOR format, as a graph of data
> objects referencing each other by content hash (CID Links).

> The process for signing a commit is to populate all the data fields, and then serialize the UnsignedCommit
> with DAG-CBOR.

(<https://web.archive.org/web/20250114205657id_/https://atproto.com/specs/repository>)

Snapshot `20251211150641` still contains `DAG-CBOR` eighteen times and `DRISL` zero times. Snapshot
`20260517024258` contains `DRISL` and zero occurrences of `DAG-CBOR`.

The change landed in the `bluesky-social/atproto-website` repository in early February 2026: commit
`1d2fb2f` ("more DRISL-CBOR term", committed 2026-02-05) on branch `bnewbold/specs-dasl`, merged as
`43a649e` ("Merge pull request #496 from bluesky-social/bnewbold/specs-dasl", 2026-02-06).
<https://github.com/bluesky-social/atproto-website/commit/1d2fb2fece43918959a239ed60cd78f64c0da3ce>

**Recommended wording for the paper:** "DRISL CBOR (a deterministic CBOR profile, successor to and sharing
multicodec `0x71` with DAG-CBOR; the atproto specifications renamed the format in February 2026)". That
survives a reviewer who last read the spec in 2025.

### 6.3 Cross-server gossip or audit for detecting a forked or rewritten repository?

**NOT FOUND — no such mechanism exists for repository content.** There is a per-consumer *local*
consistency check, the spec states plainly that its fields are unauthenticated, and the prescribed remedy
for a detected break is to adopt the PDS's new state.

`atproto.com/specs/sync`, §"Reliable Repository Synchronization":

> Instead, receiving services can verify that each #commit diff is consistent with the previous state of
> the repository, creating a chain of verification. Only a small amount of state needs to be stored for
> each repository.

> The #commit message contains both a reference to the previous repo revision (in the since field), and a
> copy of the previous root tree hash (in the prevData field). Those fields are neither authenticated
> (signed) nor self-certifying, but they can be used to check the consistency of the #commit message in
> isolation.

> To check that the "chain" of messages is consistent, receiving services should track the repo revision
> and tree root (data) for each repository. If a #commit message is received which is internally
> consistent, but the since and prevData references do not match the previous state of the repository, then
> something has gone wrong.

The prescribed response — same section:

> If the chain of #commit messages is found to have broken, or a #sync message indicates that the
> repository state has changed, then the service will need to re-synchronize the repository. This often
> means fetching the full repo CAR export.

And the protocol provides a first-class message for a PDS to *declare* a reset — §"#sync Events":

> This event asserts the current status of an account's repository. This may be a confirmation or
> clarification of the state (if nothing changed), or may reset the repository to a new state.

> Sync events are broadcast when the account repository state has been reset to a new state, or in
> situations where there might be ambiguity about the current state of the repository. For example, a #sync
> event could be emitted for an account reactivating after data corruption.

**Read together with `prev` being null (§6.1), the consequence is:** a PDS that rewrites a repository emits
a valid signed commit and, if needed, a `#sync` event; consumers detect a *discontinuity*, mark the repo
`desynchronized`, refetch, and adopt the new state. Nothing in the protocol lets a consumer prove the old
state ever existed, and nothing propagates the observation to other consumers. There is no gossip, no
witness, no tree-head exchange, and no equivocation detection.

**One genuine audit log does exist, and it is scoped to identity, not content.** `did:plc` maintains a
public operation log — <https://web.plc.directory/spec/v0.1/did-plc>, §"Overview":

> A central directory server collects and validates operations, and maintains a transparent log of
> operations for each DID.

§"Audit Logs":

> As an additional check against abuse by the PLC server, and to promote resiliency, the set of all
> identifiers is enumerable, and the set of all operations for all identifiers (even "nullified"
> operations) can be enumerated and audited.

> The audit history of a given DID (complete with timestamps and invalidated forked histories), as JSON,
> can be found at: https://plc.directory/:did/log/audit

And the trust model is stated honestly — §"PLC Server Trust Model":

> Some trust is required in the PLC server. Its attacks are limited to:
> - Denial of service: rejecting valid operations, or refusing to serve some information about the DID
> - Misordering: In the event of a fork in DID document history, the server could choose to serve the
>   "wrong" fork

This is a centralised transparency log over *key and identity* operations. It says nothing about whether a
PDS rewrote a user's posts.

### 6.4 The deletion sentence, verbatim and located

**Confirmed verbatim.** It is the **third sentence of the first paragraph** of the AT Protocol Repository
specification, immediately under the `Repository` heading, at <https://atproto.com/specs/repository>.
The full paragraph, so the sentence can be quoted in context:

> Each atproto account has a repository (or "repo") which stores all of their public data records.
> Repository contents are entirely public and verifiable ("self-certifying"). **Record deletion is
> supported without leaving a trace or "tombstone" of previous contents.**

Reinforced structurally elsewhere on the same page, §"MST Structure":

> The overall structure and shape of the MST is deterministic based on the current key/value content,
> regardless of the history of insertions and deletions that lead to the current contents.

and §"Repository Diffs":

> any records which have been "deleted" should not have the record value included

The determinism sentence is the mechanism behind the promise: because the tree shape depends only on
current contents, a repository that once held a record is byte-identical to one that never did.

---

## 7. Cells where the common belief is wrong

Each entry is a claim a reviewer (or a co-author) is likely to hold, followed by what the primary source
actually says. Section references are to this document.

1. **"BPSec is optional, so DTN nodes may skip it."** Half right, and the halves point opposite ways.
   *Implementing* BPSec is a **MUST** for any BPA that sources, verifies or accepts a bundle; *using* it on
   a given bundle is optional. RFC 9171 §8: "A Bundle Protocol Agent (BPA) that sources, cryptographically
   verifies, and/or accepts a bundle MUST implement support for BPSec. Use of BPSec for any single bundle
   is optional." (§1.2)

2. **"A DTN Block Integrity Block is a signature."** RFC 9171 §8 says "signature block", but RFC 9172 §3.7
   only requires "an authentication mechanism or an error detection mechanism", and the sole default
   context (RFC 9173 §3.1) is **HMAC-SHA2 with symmetric keys**. A default-context BIB is not verifiable by
   a third party and is not non-repudiable. The RFC's own prose overstates its specification. (§1.3)

3. **"A BPv7 bundle at minimum has an integrity check on the payload."** CRC type 0 — "no Cyclic Redundancy
   Check (CRC) is present" — is valid on any non-primary block, including the payload block. Only the
   primary block is forced to carry a CRC, and even that is waived when a BIB targets it. RFC 9171 §4.2.1,
   §4.3.1. (§1.1)

4. **"Rhizome bundles are signed by their author."** They are signed by a **randomly generated per-bundle
   keypair**. Authorship is not merely unstated but deliberately unrecoverable by third parties: "Rhizome
   nodes that do not possess the unlocked author identity cannot derive the SID of the author, *even if the
   SID is already known to them through other means*". A Rhizome signature proves update authority over a
   Bundle ID, not who wrote it. (§2.1)

5. **"A valid Rhizome manifest is a verified one."** The documentation separates the two explicitly: "Note
   that *validity* does not require that the manifest's signature be *verified*. A manifest with an
   unverified or missing signature may still be *valid*." (§2.2)

6. **"Bridgefy adopting Signal in 2020 fixed impersonation."** The 2020-10-30 press release claims "A third
   person will no longer be able to impersonate any other user". The USENIX Security 2022 follow-up found
   the opposite: "Broadcast messages continued to be unauthenticated; an adversary can exploit this to
   mount impersonation attacks", and MITM remained possible on first contact with "no option to verify the
   public keys of their contacts". Cite the vendor claim and the refutation together. (§3.2, §3.3)

7. **"Signal protocol means Bridgefy messages are signed."** Backwards. Signal is engineered for
   deniability: X3DH §4.4 — "X3DH doesn't give either Alice or Bob a publishable cryptographic proof of the
   contents of their communication or the fact that they communicated" — and §4.5 rejects identity-key
   signatures precisely because they "reduce deniability". Message authentication is symmetric AEAD under a
   per-message key. **No third party can verify any Bridgefy message, by design.** (§3.4)

8. **"ActivityPub requires HTTP Signatures for federation."** It requires neither HTTP Signatures nor object
   signatures. The entire authentication discussion lives in Appendix B, which opens "This section is
   non-normative", and states "Unfortunately at the time of standardization, there are no strongly agreed
   upon mechanisms for authentication." The normative body offers one **SHOULD**, and it is to *validate*,
   not to *sign*. Fediverse interoperable authentication is convention, not specification. (§4.2)

9. **"Mastodon keeps a tombstone when content is deleted."** It keeps a database row named `Tombstone`
   holding only `uri`, `account_id`, `by_moderator` and timestamps. Nothing serves it, no AS2 `Tombstone`
   object is emitted, and the status row is `destroy!`ed. Its only reader is a replay guard in the Create
   handler. The naming collision is doing all the work in the common belief. (§4.3)

10. **"CVE-2023-36460 (TootRoot) is the other origin-validation CVE."** It is arbitrary file write via media
    processing leading to RCE — a different bug class entirely. The correct partner to CVE-2024-23832 is
    **CVE-2024-25623** (missing `Content-Type` check when fetching remote statuses, enabling actor
    impersonation via user-uploaded documents). (§4.4)

11. **"Matrix's `m.room.tombstone` is what you get when content is removed."** `m.room.tombstone` signifies a
    **room upgrade** to a new room version and carries `replacement_room`. Content removal is *redaction*,
    which is a different and considerably stronger mechanism: the event stays in the DAG with its
    `event_id`, `sender`, `origin_server_ts`, `prev_events`, `auth_events`, `hashes` and `signatures`
    intact. (§5.3)

12. **"Matrix's signed DAG lets you detect a homeserver that rewrote history."** It lets you verify events
    you hold. It does not let you detect withholding, and there is no transparency log, gossip, or tree-head
    exchange anywhere in the specification — the only occurrence of the word "transparency" in either API
    document refers to TLS Certificate Transparency. The spec concedes the gap: "Currently, the only way to
    determine noncompliant hosts is to check the prev_events of leaked events." (§5.1)

13. **"Matrix server ACLs are a peer trust system."** They are a per-room binary allow/deny glob list,
    cooperatively enforced, with the spec noting "Server ACLs are only effective if every server in the room
    honours them" and that non-compliant servers "MUST be manually appended to the denied hosts list". There
    is no probationary state, no vouching, and no global peer state. (§5.2)

14. **"AT Protocol repositories are hash-chained, so a PDS cannot rewrite history."** The `prev` field exists
    but is "largely unused" and "virtually always null" in v3 repos. A repository is a series of signed
    *snapshots*. Combined with §6.3 — the `since`/`prevData` consistency fields are "neither authenticated
    (signed) nor self-certifying", and the prescribed response to a broken chain is to refetch and adopt the
    new state — a rewriting PDS is detectable as a discontinuity but not disprovable, and the observation is
    never shared between consumers. (§6.1, §6.3)

15. **"atproto uses DAG-CBOR."** True until early February 2026; the specifications now say **DRISL CBOR**
    throughout, while retaining multicodec `0x71`. Citing "DAG-CBOR" without qualification dates the paper;
    citing "DRISL" without noting the lineage confuses readers who know the older text. (§6.2)

16. **"atproto commits are self-certifying, so they verify offline."** The repository is self-certifying with
    respect to *content*, but not to *keys*: "neither the signature itself nor the signed commit indicate
    either the type of key used (curve type), or the specific public key used. That information must be
    fetched from the account's DID document." Verification requires resolving `plc.directory` or DNS —
    infrastructure that a network shutdown removes. This is a sharp contrast with Rhizome, where the Bundle
    ID *is* the verification key. (§6.1, §2.2)

17. **"Every federated system leaves some record of a deletion."** AT Protocol states the opposite as a
    feature, in the third sentence of its Repository specification: "Record deletion is supported without
    leaving a trace or 'tombstone' of previous contents." The MST's shape-determinism makes it structural,
    not incidental. (§6.4)

---

## 8. Gaps — questions a reviewer might ask that this note does NOT answer

Recorded so nobody re-searches them, and so nothing here is quietly filled in later by inference.

- **Bridgefy's protocol after 2022.** No first-party technical description published since 2020-10-31 was
  located. Any claim about current Bridgefy internals is unsupported. (§3.4)
- **Serval's published papers.** All Serval claims above come from `serval-dna` repository documentation and
  source. The `developer.servalproject.org` dokuwiki did not resolve on 2026-08-19. Peer-reviewed Serval
  papers were not consulted and are not cited here.
- **Whether any non-default BPSec security context defines asymmetric BIBs.** RFC 9173 defines only
  BIB-HMAC-SHA2 and BCB-AES-GCM. Whether a later context document adds signatures was not researched.
- **Mastodon 4.7.0 FEP-8b32 status.** The docs say "(unreleased)" as of 2026-08-19. Whether it has shipped
  by submission date was not checked.
- **Matrix Policy Servers (v1.18).** Located and named in §5.2 but not read in depth. If the paper makes a
  claim about delegated federation moderation in Matrix, read Server-Server API §"Policy Servers" first.
