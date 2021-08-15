/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const Instance = require('./instance');
const InstanceLoader = require('./instanceloader');
const InstanceMetadata = require('./instancemetadata');
const Template = require('./template');
const ClauseInstance = require('./clauseinstance');

const Logger = require('@accordproject/concerto-core').Logger;

const fs = require('fs');
const fsPath = require('path');
const JSZip = require('jszip');

const promisify = require('util').promisify;
const readdir = fs.readdir ? promisify(fs.readdir) : undefined;
const stat = fs.stat ? promisify(fs.stat) : undefined;

const { SlateTransformer } = require('@accordproject/markdown-slate');
//const { PdfTransformer } = require('@accordproject/markdown-pdf');
const { CiceroMarkTransformer } = require('@accordproject/markdown-cicero');
const crypto = require('crypto');
const stringify = require('json-stable-stringify');

const slateTransformer = new SlateTransformer();
const ciceroMarkTransformer = new CiceroMarkTransformer();

/**
 * An abstract class to represent a create contract instance record holder object
 * @param {string} templateSRC - a string, containing template URI in Accord format, astrting with ap://<template-id>@<template-version>#<template-hash>
 * @param {string} name - a unique id of the triggered contact instance or the clause instance
 * @param {object} data - an object with initialisation data for the specified template
 */
class ContractInstanceRecord {

    constructor(templateSRC, name, data) {
        this.templateSRC = templateSRC;
        this.name = name;
        this.data = data;
    }

    getTemplateSRC() {
        return this.templateSRC;
    }

    getName() {
        return this.name;
    }

    getData() {
        return this.data;
    }
}

/**
 * Create contract instance data holder object based on template identifier
 * @param {string} templateSRC - a string, containing template URI in Accord format, astrting with ap://<template-id>@<template-version>#<template-hash>
 * @param {string} name - a unique id of the triggered contact instance or the clause instance
 * @param {object} data - an object with initialisation data for the specified template
 */
class ContractInstanceDataRecord extends ContractInstanceRecord {

}

/**
 * Create contract instance state holder object based on template identifier
 * @param {string} templateSRC - a string, containing the template URI in Accord format, astrting with ap://<template-id>@<template-version>#<template-hash>
 * @param {string} name - a unique id of the triggered contact instance or the clause instance
 * @param {object} data - an object with data produced by the logic of the clause triggered
 * @param {string} $class - the name of a class of the action
 */
class ContractInstanceActionRecord extends ContractInstanceRecord {

    constructor(templateSRC, name, data, $class) {
        super(templateSRC, name, data);
        this.$class = $class;
    }

    setClassInit() {
        this.$class = 'org.accordproject.contractinstance.engine.init';
        return this
    }
    setClassSignature() {
        this.$class = 'org.accordproject.contractinstance.signature.sign';
        return this
    }
    setName(name) {
        this.name = name;
    }
    setTemplateSRC(templateSRC) {
        this.templateSRC = templateSRC;
    }
    setData(data) {
        this.data = data;
    }
    getClass() {
        return this.$class;
    }
    getName() {
        return this.name;
    }
    getTemplateSRC() {
        return this.templateSRC;
    }
    getData() {
        return this.data;
    }
    getState() {
        const data = this.getData();
        if (data) {
            if (data.length > 0) {
                return data.map(dataItem => {
                    return {
                        src: dataItem.src,
                        name: dataItem.name,
                        data: dataItem.result.state
                    }
                })
            }
        }
        return null
    }
    getHash() {
        const data = {
            $class: this.getClass(),
            name: this.getName,
            templateSRC: this.getTemplateSRC,
            data: this.getData()
        }
        const dataCopy = JSON.parse(stringify(data));
        const hasher = crypto.createHash('sha256');
        hasher.update(stringify(dataCopy));
        return hasher.digest('hex');
    }
}

/**
 * Create contract instance state holder object based on template identifier
 * @param {string} templateSRC - a string, containing template URI in Accord format, astrting with ap://<template-id>@<template-version>#<template-hash>
 * @param {object} data - an object with initialisation data for the specified template
 */
class ContractInstanceStateRecord extends ContractInstanceRecord {

}

/**
 * Create template data object
 * @param {string} templateSRC - a string, containing template URI in Accord format, astrting with ap://<template-id>@<template-version>#<template-hash>
 * @param {Template} template - an object with initialisation data for the specified template
 */
class TemplateRecord {
    constructor(templateSRC, template) {
        this.templateSRC = templateSRC;
        this.template = template
    }

    getTemplateSRC() {
        return this.templateSRC;
    }

    getTemplate() {
        return this.template;
    }
}

const SIGNATURE_TYPES = ["SIMPLE", "IMAGE", "ECDSA_SHA_256", "ECDSA_SHA_384", "ECDSA_SHA_512", "ECDSA_SECP256K1_KECCAK"]

/**
 * Create contract signatory object
 * @param {string} name - a unique ID of the signing identity to be mapped to the identity within the application, e.g. a Cognito user id. (using “name” instead of “id” because it seems to be a naming convention for the templates already)
 * @param {string} displayname - a free text name of the contract signatory
 * @param {string} description - a free text description of the contract signatory
 * @param {string} contractpartyid - a unique id of the contract party from the template, i.e. ”org.accordproject.party.Party#PartyA”
 * @param {integer} version - the version identifier of the contract signatory object
 * @param {string} signaturetype - one of the following signature types <"SIMPLE"|"IMAGE"| "ECDSA_SHA_256"|"ECDSA_SHA_384"|"ECDSA_SHA_512" | "ECDSA_SECP256K1_KECCAK">
 * @param {string} signingidentity - a string contraining cryptomaterial for ECDSA like PEM encoded x.509 certificate or Ethereum address or a base64 encoded image of a signature
 * @param {string} templateSRC - - a string, containing template URI in Accord format, astrting with ap://<template-id>@<template-version>#<template-hash>
 */
class ContractSignatory {
    constructor(name, displayName, description, contractPartyId, version, templateSRC, signatureType, signingIdentity) {
        this.name = name;
        this.displayname = displayName;
        this.description = description;
        this.contractpartyid = contractPartyId;
        this.version = version ? version : 0;
        this.templateSRC = templateSRC;

        if (SIGNATURE_TYPES.findIndex(signatureType) < 0) {
            throw new Error(`Please specify signature type as one fo the following: ${SIGNATURE_TYPES}`)
        }

        this.signaturetype = signatureType;
        this.signingidentity = signingIdentity;
    }

    getName() {
        return this.name;
    }

    getDisplayName() {
        return this.displayname;
    }

    getDescription() {
        return this.description;
    }

    getContractPartyId() {
        return this.contractpartyid;
    }

    getTemplateSRC() {
        return this.templateSRC;
    }

    getSignatureType() {
        return this.signaturetype;
    }

    getSigningIdentity() {
        return this.signingidentity;
    }

    sign(hash) {
        // TODO: Implement signign process depending on the value of this.signaturetyp

        switch (this.getSignatureType()) {
            case "SIMPLE":
                return hash
            case "IMAGE":
                // TODO: Combine hash with an image of the signature...
                return getSigningIdentity()
                break;
            case "ECDSA_SHA_256":
                // TODO: implement..
                return hash
                break;
            case "ECDSA_SHA_384":
                // TODO: implement..
                return hash
                break;
            case "ECDSA_SHA_512":
                // TODO: implement..
                return hash
                break;
            case "ECDSA_SECP256K1_KECCAK":
                // TODO: implement..
                return hash
                break;
            default:
                return hash
        }
    }

    verifySignature(hash, signature, cryptomaterial) {
        // TODO: Implement verification process depending on the value of this.signaturetyp
        switch (this.getSignatureType()) {
            case "SIMPLE":
                return true
            case "IMAGE":
                // TODO: Combine hash with an image of the signature...
                return true
                break;
            case "ECDSA_SHA_256":
                // TODO: implement..
                return true
                break;
            case "ECDSA_SHA_384":
                // TODO: implement..
                return true
                break;
            case "ECDSA_SHA_512":
                // TODO: implement..
                return true
                break;
            case "ECDSA_SECP256K1_KECCAK":
                // TODO: implement..
                return true
                break;
            default:
                throw new Error(`Signature type ${this.getSignatureType()} is not supported`)
        }
    }
}

/**
 * Create contract action object. Every action is a trigger of a contract template clause. Even signatures should be defined 
 * @param {integer} sequenceNumber - the number of the version of this contract action
 * @param {ContractSignatory} signatory - a unique id of the contract party from the template, i.e. ”org.accordproject.party.Party#PartyA”
 * @param {object} metadata - an object with contract instance metadata (if instantiated from a archive, comes from from package.json)
 * @param {string} signature - a stringified signature of the part of the contract
 * @param {ContractInstanceStateRecord []} contractState - an array of the states of each of the templates within the contract
 * @param {ContractInstanceActionRecord} action - an action, performed by the contract party from signatory
 * @param {string} timestamp - date and time when the action was performed in ISO 8601 format
 * @param {string} previousActionHash - the hash of the previous action
 */
class SignedContractAction {

    constructor(sequenceNumber, signatory, metadata, action, signature, contractState, timestamp, previousActionHash) {
        this.sequencenumber = sequenceNumber ? sequenceNumber : 0;
        this.signatory = signatory;
        this.metadata = metadata;
        this.signature = signature;
        this.action = action;
        this.contractstate = contractState;
        this.timestamp = timestamp ? timestamp : new Date().toISOString();
        this.previousactionhash = previousActionHash;
    }

    getSequenceNumber() {
        return this.sequenceNumber;
    }

    getSignatory() {
        return this.signatory;
    }

    getMetadata() {
        return this.metadata;
    }

    getSignature() {
        return this.signature;
    }

    getContractState() {
        return this.contractState;
    }

    getAction() {
        return this.action;
    }

    getTimestamp() {
        return this.timestamp;
    }

    getPreviousHash() {
        return this.previousActionHash;
    }

    getHash() {
        const data = {
            sequencenumber: this.getSequenceNumber(),
            signatory: this.getSignatory(),
            metadata: this.getMetadata(),
            signature: this.getSignature(),
            action: this.getAction(),
            contractstate: this.getContractState(),
            timestamp: this.getTimestamp(),
            previousactionhash: this.getPreviousHash()
        }
        const dataCopy = JSON.parse(stringify(data));
        const hasher = crypto.createHash('sha256');
        hasher.update(stringify(dataCopy));
        return hasher.digest('hex');
    }
}

/**
 * A Contract is executable business logic, linked to a natural language (legally enforceable) template.
 * A Clause must be constructed with a template and then prior to execution the data for the clause must be set.
 * Set the data for the clause (an instance of the template model) by either calling the setData method or by
 * calling the parse method and passing in natural language text that conforms to the template grammar.
 * @public
 * @class
 */
class ContractInstance {

    /**
     * Create an instance of a contract
     * @param {InstanceMetadata} metadata - the metadata object
     * @param {CiceroMarkDOM} textCiceroMark - contains the text of the contract in CiceroMark format and used when contract instance is initialised from other than fromTemplateWithData()
     * @param {TemplateRecord []} templates - an array of template objects used in the contract instance
     * @param {ContractSignatory[]} signatories - an array of signatories, representing contract parties
     * @param {SignedContractAction[]} actions - an array of contract actions, performed by contract signratories
     */
    constructor(metadata, textCiceroMark, templates, signatories, actions) {
        this.metadata = metadata ? this.setMetadata(metadata) : null;
        this.textCiceroMark = textCiceroMark ? setTextCiceroMark(textCiceroMark) : null; // Used when we initialise contract instance from CiceroMarkdown
        this.templates = (templates && templates[0] instanceof TemplateRecord) ? templates : [];
        this.signatories = (signatories && signatories[0] instanceof ContractSignatory) ? signatories : [];
        this.actions = (actions && actions[0] instanceof SignedContractAction) ? actions : [];
    }

    setMetadata(metadata) {
        // we assume we continue using package.json format
        const packageJson = JSON.parse(JSON.stringify(metadata));
        if (packageJson.dependencies) {
            delete packageJson.dependencies;
        }
        if (packageJson.devDependencies) {
            delete packageJson.devDependencies;
        }
        if (packageJson.scripts) {
            delete packageJson.scripts;
        }
        this.metadata = packageJson
    }

    setTextCiceroMark(ciceroMarkObject) {
        this.textCiceroMark = ciceroMarkObject
    }

    addTemplate(template) {
        this.addTemplateRecord(new TemplateRecord(this.generateTemplateSRC(template), template));
    }

    addTemplateRecord(templateRecord) {
        if (!this.templates) {
            this.templates = []
        }
        this.templates.push(templateRecord);
    }

    addSignatory(name, displayName, description, contractPartyId, version, templateSRC, signatureType, signingIdentity) {
        this.signatories.push(new ContractSignatory(name, displayName, description, contractPartyId, version, templateSRC, signatureType, signingIdentity));
    }

    addNewContractAction(signatory, action, timestamp) {
        const lastActionSequenceNumber = lastActionSequenceNumber ? lastActionSequenceNumber : this.getLastActionSequenceNumber();
        const actionSequenceNumber = lastActionSequenceNumber + 1;
        const actionContractState = action.getContractState();
        const lastContractState = this.getLastContractState();

        let contractState = [];
        if (lastContractState) {
            contractState = lastContractState.map(contractStateItem => {
                for (let i = 0; i < actionContractState.length; i++) {
                    const actionContractStateItem = actionContractState[i];
                    if (contractStateItem.name = actionContractStateItem.name) {
                        return actionContractStateItem
                    }
                }
            })
        } else {
            contractState = actionContractState;
        }

        const newSignedActionHash = this.generateNewSignedActionHash(action);
        const signature = signatory.sign(newSignedActionHash);

        this.addSignedContractAction(new SignedContractAction(actionSequenceNumber, signatory, this.getMetadata(), action, signature, contractState, timestamp, previousActionHash));
    }

    generateSignedContractActionHash(action) {
        const previousActionHash = this.getLastAction().getHash();
        const actionHash = action.getHash();
        const contractHash = this.getHash();

        const signedContractActionHash = `${previousActionHash}${actionHash}${contractHash}`;

        const hasher = crypto.createHash('sha256');
        hasher.update(signedContractActionHash);
        return hasher.digest('hex');
    }

    addSignedContractAction(signedContractAction) {
        this.actions.push(signedContractAction);
    }

    getMetadata() {
        return this.metadata;
    }

    getContractDataAsTextCiceroMark() {

        if (this.textCiceroMark) {
            return this.textCiceroMark
        } else {
            throw new Error(`Contract is not initialised neither from a set of templates with data nor from the CiceroMarkdown`);
        }

    }

    getContractDataAsObject() {

        if (!this.textCiceroMark) {
            throw new Error(`Contract is not initialised neither from a set of templates with data nor from the CiceroMarkdown`);
        }

        // If the data object is not initialised yet, need to parse this.textCiceroMark and generate data objects from it
        const contractData = []
        //TODO: If we are here, we were initialised not from template with data, so need to extract data from CiceroMark

        const ciceroContractAst = this.getContractDataAsTextCiceroMark();

        ciceroContractAst.nodes.forEach(async node => {
            if (node.$class === 'org.accordproject.ciceromark.Clause' && node.src) {
                const template = this.getTemplate(node.src.substring(5));
                if (template) {
                    const clause = new Clause(template);
                    clause.parse(ciceroMarkTransformer.getClauseText(node));
                    const data = clause.getData();
                    const templateSRC = this.generateTemplateSRC(template);
                    const name = node.name;
                    contractData.push(new ContractInstanceDataRecord(templateSRC, name, data))
                }
                else {
                    throw new Error(`Failed to find template ${template}`);
                }
            }
        });

        return contractData;
    }

    getContractDataByTemplateId(templateSRC) {
        this.getContractDataAsObject().forEach((dataItem) => {
            if (dataItem.getTemplateSRC() === templateSRC) {
                return dataItem.getData()
            }
        })
    }

    getActions() {
        return this.actions;
    }

    getLastAction() {
        const actions = this.getActions();
        if (actions.length === 0) {
            return null
        } else {
            return actions[actions.length - 1];
        }
    }

    getLastActionSequenceNumber() {
        const lastAction = this.getLastAction();
        if (lastAction) {
            return lastAction.getSequenceNumber();
        } else {
            return -1;
        }
    }

    getActionBySequenceNumber(actionSequenceNumber) {
        const actions = this.getActions();
        if (actions.length === 0) {
            return null
        } else {
            if (actions[actionSequenceNumber] && actions[actionSequenceNumber].getSequenceNumber() === actionSequenceNumber) {
                return actions[actionSequenceNumber]
            } else {
                for (let i = 0; i < actions.length; i++) {
                    if (actions[i].getSequenceNumber() === actionSequenceNumber) {
                        return actions[i];
                    }
                }
                return null
            }
        }
    }

    getLastContractState() {
        const lastAction = this.getLastAction();
        if (lastAction) {
            return lastAction.getContractState();
        }
        return null
    }

    getSignatories() {
        return this.signatories
    }

    getSignatoryByPartyId(contractPartyId) {
        const signatories = this.getSignatories()
        signatories.forEach((signatory) => {
            if (signatory.getContractPartyId() === contractPartyId) {
                return signatory
            }
        })
        return this.signatories
    }

    getSignatoryByName(name) {
        const signatories = this.getSignatories()
        signatories.forEach((signatory) => {
            if (signatory.getName() === name) {
                return signatory
            }
        })
        return this.signatories
    }

    getTemplates() {
        return this.templates
    }

    getTemplateById(templateSRC) {
        const templateRecords = this.getTemplates()
        for (let i = 0; i < templateRecords.length; i++) {
            const templateRecord = templateRecords[i];
            if (templateRecord.getTemplateSRC() === templateSRC) {
                return templateRecord.getTemplate()
            }
        }
    }

    generateTemplateSRC(template) {
        return `ap://${template.getIdentifier()}#${template.getHash()}`
    }


    /**
     * Convert Contract Instance initialised from templates with data object to CiceroMark
     * @return {object} - the CiceroMark instance
     */
    toCiceroMark() {
        return this.getContractDataAsTextCiceroMark()
    }

    // toSlate() {
    //     const contractCiceroMark = this.toCiceroMark();

    //     console.log(`Converted ciceroContractAst: ${JSON.stringify(contractCiceroMark)}`);
    //     const slateDom = slateTransformer.fromCiceroMark(contractCiceroMark);

    //     return slateDom.document.children;
    // }

    fromTemplatesWithSlate(slateEditor) {

        const contractCiceroMark = slateTransformer.toCiceroMark({ document: slateEditor });
        this.setTextCiceroMark(contractCiceroMark);
        return this;
    }

    /**
     * Create an instance from a Template with data.
     * @param {Template[]} templates  - an array of templates for the instance
     * @param {object[]} dataObjects - an array of data objects, corresponding to the respective template in the specified array of templates
     * @return {object} - the contract instance
     */
    fromTemplatesWithData(templates, dataObjects) {

        let ciceroMarkFormat = {
            $class: 'org.accordproject.commonmark.Document',
            xmlns: 'http://commonmark.org/xml/1.0',
            nodes: []
        };

        ciceroMarkFormat.nodes = dataObjects.map((dataRecord, index) => {
            const template = templates[index];
            if (template) {
                const clause = ClauseInstance.fromTemplate(template);
                clause.setData(dataRecord);
                const ciceroMark = clause.draft({ format: "ciceromark_parsed" });
                this.addTemplate(template);
                return {
                    $class: 'org.accordproject.ciceromark.Clause',
                    src: this.generateTemplateSRC(template),
                    name: dataRecord.$identifier,
                    nodes: ciceroMark.nodes
                }
            } else {
                throw new Error(`Failed to find template with index ${index}`);
            }
        })

        // Setting text CiceroMark object as well
        this.setTextCiceroMark(ciceroMarkFormat);

        return this
    }

    /**
     * Create an instance from an array of Templates with a document in MarkdownCicero format
     * @param {Template[]} templates  - an array of templates for the instance
     * @param {MarkdownCicero} markdownCicero - a text in Markdown Cicero format, generated from a combination of multiple templates
     * @return {object} - the contract instance
     */
    fromTemplatesWithMarkdownCicero(templates, markdownCicero) {

        const ciceroMarkFormat = 'ciceromark_parsed';
        const ciceroContractAst = ciceroMarkTransformer.fromMarkdownCicero(markdownCicero);
        let ciceroContractAstCopy = JSON.parse(JSON.stringify(ciceroContractAst));

        //console.log(`Start processing ciceroContractAst: ${JSON.stringify(ciceroContractAst)}`);
        ciceroContractAstCopy.nodes = ciceroContractAst.nodes.map(node => {
            if (node.$class === 'org.accordproject.ciceromark.Clause' && node.src) {
                const templateId = node.src;

                // Finding the template from the proposed array
                const template = templates.find((template) => {
                    const currentTemplateId = this.generateTemplateSRC(template);
                    return templateId === currentTemplateId;
                })

                if (template) {
                    const clause = ClauseInstance.fromTemplate(template);
                    clause.parse(ciceroMarkTransformer.getClauseText(node));
                    const ciceroMark = clause.draft({ format: ciceroMarkFormat });
                    let nodeCopy = JSON.parse(JSON.stringify(node));
                    nodeCopy.nodes = ciceroMark.nodes;

                    this.addTemplate(template);

                    return nodeCopy;
                }
                else {
                    throw new Error(`Failed to find template ${templateId}`);
                }
            } else {
                return node;
            }
        });
        this.setTextCiceroMark(ciceroContractAstCopy);

        return this
    }

    toMarkdownCicero() {
        const contractCiceroMark = this.toCiceroMark();
        const ciceroMarkUnwrapped = ciceroMarkTransformer.toCiceroMarkUnwrapped(contractCiceroMark);
        return ciceroMarkTransformer.toMarkdownCicero(ciceroMarkUnwrapped);
    }

    toJSON() {
        let json = this.collectContentForHash();
        json.metadata = this.getMetadata();
        json.templates = [];
        const templates = this.getTemplates();
        json.templates = templates.map(template => {
            return template.getTemplateSRC()
        })
        return json;
    }

    validateHash(hash, actionSequenceNumber) {
        const contractInstanceDigest = this.getHash(actionSequenceNumber);

        if (contractInstanceDigest === hash) {
            console.log(`Hash is good: ${contractInstanceDigest}`)
            return true;
        } else {
            console.log(`Hash is bad: ${contractInstanceDigest}`)
            return false;
        }
    }

    /**
     * Generates contract hash based on the currently initialised contract instance
     * @param {number} actionSequenceNumber - sequence number of an action, for which we generate the hash
     * @return {string} - the hash of the contract instance
     */
    getHash(actionSequenceNumber) {
        const dataCopy = JSON.parse(stringify(this.collectContentForHash(actionSequenceNumber)));
        const hasher = crypto.createHash('sha256');
        hasher.update(stringify(dataCopy));
        return hasher.digest('hex');
    }

    /**
     * Collects all contract instance data as a JSON object to be hashed
     * @param {number} actionSequenceNumber - sequence number of an action, for which we which we want to generate hash
     * @return {object} - the contract instance object only with `textCiceroMark`,  `signatories` and the latest (or actions[actionSequenceNumber]) `action`  objects.
     */
    collectContentForHash(actionSequenceNumber) {
        const content = {};
        content.textCiceroMark = this.getContractDataAsTextCiceroMark();
        content.signatories = this.getSignatories();
        content.action = actionSequenceNumber ? this.getActionBySequenceNumber(actionSequenceNumber) : this.getLastAction();
        return content;
    }

    /**
     * Sign contract from the name of the certain defined party id
     * @param {string} contractPartyId - an ID of a contract party, signing the contract
     * @return {object} - the contract instance object with the latest action object containing the signature
     */
    signContract(contractPartyId) {
        const signatory = this.getSignatory(contractPartyId)
        const timestamp = new Date().toISOString()
        const action = new ContractInstanceActionRecord().setClassSignature();

        this.addNewContractAction(signatory, action, timestamp)
        return this
    }

    /**
     * Initialise the contract instance using the signatory by the contract party id
     * @param {number} contractPartyId - an ID of a contract party, initialising the contract
     * @return {object} - the contract instance object with the latest action object containing the execution results of all templates
     */
    init(contractPartyId) {
        const signatory = this.getSignatory(contractPartyId)
        const timestamp = new Date().toISOString()
        const action = new ContractInstanceActionRecord().setClassInit();

        const contractCiceroMark = this.getContractDataAsTextCiceroMark();
        const allResults = contractCiceroMark.nodes.map(node => {
            if (node.$class === 'org.accordproject.ciceromark.Clause' && node.src) {

                if (contractInstanceClauseName && (node.name !== contractInstanceClauseName)) {
                    return
                }

                console.log(`${fcnName} Processing clause with Id: ${contractInstanceClauseName}`);

                // Retrieving template from a catalogue
                const template = this.getTemplateById(node.src);
                if (template) {

                    const clause = ClauseInstance.fromTemplate(template);
                    clause.parse(ciceroMarkTransformer.getClauseText(node));
                    const engine = clause.getEngine();
                    const logicManager = clause.getLogicManager();
                    const data = clause.getData();
                    const result = engine.init(logicManager, node.name, data, {}, timestamp);

                    return {
                        src: node.src,
                        name: node.name,
                        result: result
                    };
                }
            }
            else {
                console.log(`${fcnName} Failed to find template ${template}`);
                throw new Error(`${fcnName} Failed to find template ${template}`);
            }
        });
        const results = allResults.filter((result) => {
            return result !== undefined;
        });
        if (results.length == 0) {
            throw new Error(`${fcnName} Could not invoke contract or execute clause with name ${contractInstanceClauseName} in the contract with id ${this.getInstanceId()}`);
        }

        action.setData(results);

        this.addNewContractAction(signatory, action, timestamp);

        return this;
    }

    // async runCiceroAction(ciceroEngineActionFunction, params, state, currentTime, contractInstanceClauseName) {
    //     const fcnName = "[ContractInstance.runCiceroAction]"
    //     const contractCiceroMark = ciceroMarkTransformer.fromMarkdownCicero(this.getData());
    //     if (params) {
    //         console.log(`${fcnName} Begin processing for params: ${JSON.stringify(params)}, state: ${JSON.stringify(state)}, currentTime: ${currentTime}, contractInstanceClauseName: ${contractInstanceClauseName}`);
    //     }
    //     const allResults = await Promise.all(contractCiceroMark.nodes.map(async node => {
    //         if (node.$class === 'org.accordproject.ciceromark.Clause' && node.src) {

    //             if (contractInstanceClauseName && (node.name !== contractInstanceClauseName)) {
    //                 return
    //             }

    //             console.log(`${fcnName} Processing clause with Id: ${contractInstanceClauseName}`);

    //             // Retrieving template from a catalogue
    //             const template = await templatesLibraryService.getTemplate(node.src);
    //             if (template) {
    //                 try {
    //                     const clause = new Clause(template);
    //                     clause.parse(ciceroMarkTransformer.getClauseText(node));
    //                     console.log(`${fcnName} Executing clause: ${stringify(clause)}`);

    //                     let result = {};

    //                     // Assuming we run Engine.init
    //                     if (!params) {
    //                         result = await ciceroEngineActionFunction(clause, currentTime);
    //                     } else if (params && state) {
    //                         // Assuming we run Engine.invoke
    //                         result = await ciceroEngineActionFunction(clause, params, state, currentTime);
    //                     } else {
    //                         throw new Error(`${fcnName} Can't select the right signature for Ergo Engine action function for clause with name ${contractInstanceClauseName} in the contract with id ${this.getInstanceId()}`);
    //                     }
    //                     // const engine = new Engine();
    //                     // const result = await engine.init(clause);
    //                     // console.log(`${fcnName} Response from engine init method: ${stringify(result)}`);
    //                     return {
    //                         name: node.name,
    //                         result: result
    //                     };
    //                 }
    //                 catch (error) {
    //                     console.log(`${fcnName} ${error.stack}`);
    //                     throw error
    //                 }
    //             }
    //             else {
    //                 console.log(`${fcnName} Failed to find template ${template}`);
    //                 throw new Error(`${fcnName} Failed to find template ${template}`);
    //             }
    //         }
    //     }));
    //     const results = allResults.filter((result) => {
    //         return result !== undefined;
    //     });
    //     if (results.length == 0) {
    //         throw new Error(`${fcnName} Could not invoke contract or execute clause with name ${contractInstanceClauseName} in the contract with id ${this.getInstanceId()}`);
    //     }
    //     return results
    // }

    /**
     * Persists this instance to a Smart Legal Contract (slc) file.
     * @param {string} [runtime] - target runtime for the archive
     * @param {Object} [options] - JSZip options
     * @return {Promise<Buffer>} the zlib buffer
     */
    async toArchive(runtime, options) {
        const runtimeSet = runtime && typeof (runtime) === 'string' ? runtime : 'ergo';

        let zip = new JSZip();

        // save the metadata

        let packageFileContents = stringify(this.getMetadata());
        zip.file('package.json', packageFileContents, options);

        // save the contract textCiceroMark object
        const textCiceroMarkContents = stringify(this.getContractDataAsTextCiceroMark());

        zip.file('dataCiceroMark.json', textCiceroMarkContents, options);

        // save the templates
        zip.file('templates/', null, Object.assign({}, options, {
            dir: true
        }));

        const templates = this.getTemplates();
        const templateArchives = await Promise.all(templates.map(async (templateRecord) => {
            const template = templateRecord.getTemplate();
            const templateContent = await template.toArchive(runtimeSet);
            return {
                name: `${template.getIdentifier()}.cta`,
                content: templateContent
            }
        }))

        templateArchives.forEach((templateArchive) => {
            zip.file('templates/' + templateArchive.name, templateArchive.content, options);
        })

        // save the signatories
        const signatoriesContents = stringify(this.getSignatories());
        zip.file('signatories.json', signatoriesContents, options);

        // save the actions

        let actionsFiles = this.getActions().map((action) => {
            return {
                name: `${action.getSequenceNumber()}.json`,
                content: stringify(action)
            }
        });
        zip.file('actions/', null, Object.assign({}, options, {
            dir: true
        }));
        actionsFiles.forEach(function (file) {
            zip.file('actions/' + file.name, file.content, options);
        });

        return zip.generateAsync({
            type: 'nodebuffer'
        }).then(something => {
            return Promise.resolve(something).then(result => {
                return result;
            });
        });
    }

    /**
     * Create a contract instance from an archive
     * @param {Buffer} buffer  - the buffer to a Smart Legal Contract (slc) file
     * @param {object} options - additional options
     * @return {Promise<Instance>} a Promise to the instance
     */
    async fromArchive(buffer) {

        let self = this;
        const method = 'fromArchive';
        const zip = await JSZip.loadAsync(buffer);

        // load metadata
        const metadata = await InstanceLoader.loadZipFileContents(zip, 'package.json', true, true);
        this.setMetadata(metadata);

        // load contract data as Cicero Mark Text
        const dataCiceroMark = await InstanceLoader.loadZipFileContents(zip, 'dataCiceroMark.json', true, true);
        this.setTextCiceroMark(dataCiceroMark);

        // load template files
        Logger.debug(method, 'Looking for template files');
        const ctaFiles = await this.loadZipFilesContents(zip, /^templates[/\\].*\.cta$/);
        if (ctaFiles.length > 0) {
            await Promise.all(ctaFiles.map(async (file) => {
                const template = await Template.fromArchive(file.contents);
                //this.addTemplate(template);
                this.addTemplateRecord(new TemplateRecord(this.generateTemplateSRC(template), template));
                //this.templates = [template];
            }))
        } else {
            Logger.debug(method, 'No template files');
        }

        // load signatories (not a required file)
        Logger.debug(method, 'Looking for signatories');
        const signatories = await InstanceLoader.loadZipFileContents(zip, 'signatories.json', true, false);
        if (signatories) {
            signatories.map((signatory) => {
                this.addSignatory(signatory.name,
                    signatory.displayName,
                    signatory.description,
                    signatory.contractPartyId,
                    signatory.version,
                    signatory.templateSRC,
                    signatory.signatureType,
                    signatory.signingIdentity)
            })
        } else {
            Logger.debug(method, 'Signatories not found');
        }

        // load actions
        Logger.debug(method, 'Loading action files');
        let actionFiles = await InstanceLoader.loadZipFilesContents(zip, /^actions[/\\].*\.json$/);
        actionFiles.sort((first, second) => {
            const firstSequenceNumber = first.contents.sequencenumber;
            const secondSequenceNumber = second.contents.sequencenumber;
            // In ascending order
            return firstSequenceNumber - secondSequenceNumber;
        });
        for (let i = 0; 0 < actionFiles.length; i++) {
            const action = file.contents;
            this.addSignedContractAction(new SignedContractAction(action.sequencenumber, action.signatory, action.metadata, action.action, action.signature, action.contractstate, action.timestamp, action.previousactionhash));
        }

        return this;
    }

    /**
    * Loads the contents of all files in the zip that match a regex
    * @internal
    * @param {*} zip the JSZip instance
    * @param {RegExp} regex the regex to use to match files
    * @return {Promise<object[]>} a promise to an array of objects with the name and contents of the zip files
    */
    async loadZipFilesContents(zip, regex) {
        const results = [];
        let matchedFiles = zip.file(regex);

        // do not use forEach, because we need to call an async function!
        for (let n = 0; n < matchedFiles.length; n++) {
            const file = matchedFiles[n];
            const result = {
                name: file.name,
                contents: await zip.file(file.name).async("arraybuffer")
            };
            results.push(result);
        }

        return results;
    }
}

module.exports = ContractInstance;
